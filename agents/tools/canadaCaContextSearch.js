import { retryOnTransientError } from '../../api/util/transient-retry.js';
import { maskSecretValue, sanitizeErrorForLogging } from './utils/searchUtils.js';

const MAX_SEARCH_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const SEARCH_REQUEST_TIMEOUT_MS = 30000;

// Checked after a failure, before starting another attempt, so a slow-*failing*
// origin cannot have its wait multiplied by MAX_SEARCH_ATTEMPTS. Failures that
// return fast (a reset mid-read) are nowhere near it and still get every attempt.
//
// This does NOT bound a hang: the `timeout: 30000` on the fetch below is dead
// config (native fetch ignores it, unlike node-fetch), so if Coveo accepts the
// connection and never answers, nothing fails, nothing is checked here, and the
// turn blocks until undici's 300s header timeout. Fixing that means an explicit
// AbortSignal.timeout — deliberately left for the direct-API work noted on
// contextSearch below, since it changes when a slow-but-successful search
// becomes a failure.
const RETRY_TIME_BUDGET_MS = 10000;
const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function splitCoveoQuery(query) {
    const restrictions = [];
    let keywords = query.replace(/\binurl:([A-Za-z0-9][A-Za-z0-9._-]*)/gi, (_directive, segment) => {
        restrictions.push(`@uri=${segment}`);
        return '';
    });
    keywords = keywords.replace(/\bsite:([^\s]+)/gi, (directive, value) => {
        const hostname = value.toLowerCase().replace(/\.$/, '');
        if (!HOSTNAME_PATTERN.test(hostname)) return directive;
        restrictions.push(`@hostname=="${hostname}"`);
        return '';
    }).replace(/\s+/g, ' ').trim();

    return {
        keywords,
        advancedQuery: restrictions.join(' AND '),
    };
}

/**
 * Extracts search results from the Coveo Search API response.
 * @param {object} results - The Coveo search results object.
 * @param {number} numResults - The number of top results to extract.
 * @returns {string} - The formatted top search results with summary, link, and link text.
 */
function extractSearchResults(results, numResults = 5) {
    if (!results?.results || results.results.length === 0) {
        console.info("No search results found");
        return "No results found.";
    }

    const topResults = results.results.slice(0, numResults).map(result => ({
        department: result.raw?.department,
        organization: getSourceOrganization(result.raw),
        link: result.clickUri || 'No link available',
        linkText: result.title || 'No title available',
        summary: result.excerpt || 'No summary available'
    }));

    const extractedResults = topResults.map(result => {
        const ownership = [
            result.organization && `Organization: ${result.organization}`,
            result.department && `Department: ${result.department}`,
        ].filter(Boolean).join("\n");
        const ownershipLine = ownership ? `${ownership}\n` : '';

        return `Title: ${result.linkText}\n${ownershipLine}Link: ${result.link}\nSummary: ${result.summary}\n`;
    }).join("\n");
    console.info("Extracted search results:", extractedResults);
    return extractedResults;
}

function getSourceOrganization(raw = {}) {
    const sourceOrganization = raw.sysauthor || raw.author || raw['dcterms.creator'];
    if (Array.isArray(sourceOrganization)) {
        return sourceOrganization
            .filter((value) => typeof value === 'string' && value.trim())
            .join(', ');
    }
    return typeof sourceOrganization === 'string' && sourceOrganization.trim()
        ? sourceOrganization
        : '';
}

/**
 * One attempt at the Coveo call. Separated from contextSearch so the retry
 * wrapper has a single unit to repeat: the request, the status check, and the
 * body read all belong to it, because a response can start 200 and then have
 * its body stream die.
 */
async function fetchSearchResults(query, lang) {
    const isFrench = lang && lang.toLowerCase().startsWith('fr');
    const { keywords, advancedQuery } = splitCoveoQuery(query);
    const searchPageUrl = isFrench
        ? 'https://www.canada.ca/fr/sr/srb.html'
        : 'https://www.canada.ca/en/sr/srb.html';
    const searchPageRelativeUrl = isFrench ? '/fr/sr/srb.html' : '/en/sr/srb.html';
    const requestBody = {
        q: keywords,
        cq: advancedQuery,
        locale: isFrench ? 'fr' : 'en',
        context: { searchPageUrl, searchPageRelativeUrl },
        pipeline: 'Canada public websites - Generic',
        enableQuerySyntax: false,
        searchHub: 'canada-gouv-public-websites',
        numberOfResults: 5,
        firstResult: 0,
        mlParameters: {
            filters: {
                c_context_searchpageurl: searchPageUrl,
                c_context_searchpagerelativeurl: searchPageRelativeUrl,
            },
        },
    };
    const response = await fetch(process.env.CANADA_CA_SEARCH_URI, {
        method: "POST",
        signal: AbortSignal.timeout(SEARCH_REQUEST_TIMEOUT_MS),
        headers: {
            "Authorization": `Bearer ${process.env.CANADA_CA_SEARCH_API_KEY}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": process.env.USER_AGENT || "ai-answers"
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        // Try to log the full error response
        const errorBody = await response.text();
        console.error("HTTP Error Response:", {
            status: response.status,
            statusText: response.statusText,
            body: maskSecretValue(errorBody)
        });
        const error = new Error(`HTTP error! Status: ${response.status}, StatusText: ${response.statusText}`);
        // fetch reports the status on the response, not the error. Without this
        // the retry wrapper sees a bare Error and treats a 503 as permanent.
        error.status = response.status;
        throw error;
    }
    const results = await response.json();
    const returnedResults = Array.isArray(results?.results) ? results.results : [];
    const artRecommendedResults = returnedResults.filter((result) => result.isRecommendation === true);
    console.log('Coveo ART used:', artRecommendedResults.length > 0);
    return results;
}

/**
 * @param {string} query - The search query.
 * @param {string} lang - The language of the search query.
 * @param {object} [options]
 * @param {(info: {error: unknown, attempt: number, attempts: number}) => void} [options.onRetry]
 *   Called before each retry so a caller can record the attempt (see
 *   SearchContextService). Best-effort telemetry only.
 * @returns {object|null} - The Coveo search results.
 */
async function contextSearch(query, lang, { onRetry } = {}) {
    try {
        console.log(`Starting search with query: ${query} at endpoint: ${process.env.CANADA_CA_SEARCH_URI}`);

        // A dropped socket or a 5xx gets another attempt; a 4xx or a bad API key
        // fails immediately rather than sleeping to return the same error.
        const results = await retryOnTransientError(
            () => fetchSearchResults(query, lang),
            {
                attempts: MAX_SEARCH_ATTEMPTS,
                baseDelayMs: RETRY_BASE_DELAY_MS,
                maxElapsedMs: RETRY_TIME_BUDGET_MS,
                onRetry: (info) => {
                    console.warn(
                        `Canada.ca search attempt ${info.attempt}/${info.attempts} failed with a transient error, retrying:`,
                        maskSecretValue(info.error?.message)
                    );
                    if (onRetry) onRetry(info);
                },
            }
        );

        return {
            results: extractSearchResults(results),
            provider: "canadaca"
        };
    } catch (error) {
        console.error("Error performing Canada.ca search:", sanitizeErrorForLogging(error));
        return {
            failed: true,
            results: "Search failed: " + maskSecretValue(error.message),
            provider: "canadaca"
        };
    }
}

export { contextSearch };
