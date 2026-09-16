import { retryOnTransientError } from '../../api/util/transient-retry.js';
import { maskSearchSecrets, sanitizeSearchErrorForLogging } from '../../api/util/search-error-redaction.js';

const MAX_SEARCH_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_TIME_BUDGET_MS = 10000;

function getSourceOrganization(raw = {}) {
    const sourceOrganization = raw.sysauthor || raw.author || raw['dcterms.creator'];
    if (Array.isArray(sourceOrganization)) {
        return sourceOrganization.filter((value) => typeof value === 'string' && value.trim()).join(', ');
    }
    return typeof sourceOrganization === 'string' && sourceOrganization.trim()
        ? sourceOrganization
        : '';
}

// Same Title/Link/Summary output shape as googleContextSearch. Coveo's source
// organization is additional context for the department-matching agent.
function extractSearchResults(results, numResults = 3) {
    if (!results?.results?.length) {
        console.info('No search results found');
        return 'No results found.';
    }

    const extractedResults = results.results.slice(0, numResults).map((result) => {
        const sourceOrganization = getSourceOrganization(result.raw);
        const sourceLine = sourceOrganization ? `Source organization: ${sourceOrganization}\n` : '';
        return `Title: ${result.title || 'No title available'}\nLink: ${result.clickUri || result.uri || 'No link available'}\n${sourceLine}Summary: ${result.excerpt || 'No summary available'}\n`;
    }).join('\n');
    console.info('Extracted search results:', extractedResults);
    return extractedResults;
}

async function fetchSearchResults({ query, lang }) {
    const searchUri = process.env.CANADA_CA_SEARCH_URI;
    const searchApiKey = process.env.CANADA_CA_SEARCH_API_KEY;
    if (!searchUri || !searchApiKey) {
        throw new Error('Missing required environment variables: CANADA_CA_SEARCH_URI or CANADA_CA_SEARCH_API_KEY');
    }

    const locale = lang?.toLowerCase().startsWith('fr') ? 'fr-CA' : 'en-CA';
    const searchHub = process.env.CANADA_CA_SEARCH_HUB || 'canada-gouv-public-websites';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(searchUri, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${searchApiKey}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                q: query,
                searchHub,
                locale,
                forwardLanguageToCoveoIndex: true,
            }),
        });

        if (!response.ok) {
            const error = new Error(`HTTP error! Status: ${response.status}, StatusText: ${response.statusText}`);
            error.status = response.status;
            throw error;
        }
        return response.json();
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * @returns {{ provider: 'canadaca', results: string, failed?: true }}
 */
async function contextSearch(query, lang, { onRetry } = {}) {
    try {
        const results = await retryOnTransientError(
            () => fetchSearchResults({ query, lang }),
            {
                attempts: MAX_SEARCH_ATTEMPTS,
                baseDelayMs: RETRY_BASE_DELAY_MS,
                maxElapsedMs: RETRY_TIME_BUDGET_MS,
                onRetry: (info) => {
                    console.warn(
                        `Canada.ca search attempt ${info.attempt} failed with a transient error, retrying:`,
                        maskSearchSecrets(info.error?.message, [process.env.CANADA_CA_SEARCH_API_KEY])
                    );
                    if (onRetry) onRetry(info);
                },
            }
        );

        return {
            results: extractSearchResults(results),
            provider: 'canadaca',
        };
    } catch (error) {
        console.error(
            'Error performing Canada.ca search:',
            sanitizeSearchErrorForLogging(error, [process.env.CANADA_CA_SEARCH_API_KEY])
        );
        return {
            failed: true,
            results: `Search failed: ${maskSearchSecrets(error.message, [process.env.CANADA_CA_SEARCH_API_KEY])}`,
            provider: 'canadaca',
        };
    }
}

export { contextSearch };
