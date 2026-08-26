import { google } from 'googleapis';
import { retryOnTransientError } from '../../api/util/transient-retry.js';

const customsearch = google.customsearch('v1');

function maskSecretValue(text) {
    if (!text) return text;

    return String(text)
        .replace(/([?&]key=)([^&\s]+)/gi, '$1[REDACTED]');
}

function sanitizeErrorForLogging(error) {
    if (!error) return error;

    return {
        name: error.name,
        message: maskSecretValue(error.message),
        code: error.code,
        status: error.status,
        stack: maskSecretValue(error.stack),
    };
}

const MAX_SEARCH_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;


/**
 * Extracts search results from Google Custom Search API response.
 * @param {object} results - The search results from Google Custom Search API.
 * @param {number} numResults - The number of top results to extract.
 * @returns {string} - The formatted top search results with summary, link, and link text.
 */
function extractSearchResults(results, numResults = 3) {
    if (!results?.items || results.items.length === 0) {
        console.info("No search results found");
        return "No results found.";
    }

    const topResults = results.items.slice(0, numResults).map(result => ({
        link: result.link,
        linkText: result.title,
        summary: result.snippet
    }));

    const extractedResults = topResults.map(result =>
        `Title: ${result.linkText}\nLink: ${result.link}\nSummary: ${result.summary}\n`
    ).join("\n");
    console.info("Extracted search results:", extractedResults);
    return extractedResults;
}

/**
 * @param {string} query - The search query.
 * @param {string} lang - The language of the search query.
 * @returns {object|null} - The Google search results.
 */
/**
 * @param {string} query
 * @param {string} lang
 * @param {object} [options]
 * @param {(info: {error: unknown, attempt: number, attempts: number}) => void} [options.onRetry]
 *   Called before each retry so a caller can record the attempt (see
 *   SearchContextService). Best-effort telemetry only.
 */
const contextSearch = async (query, lang, { onRetry } = {}) => {
    try {
        const CX = process.env.GOOGLE_SEARCH_ENGINE_ID;
        const API_KEY = process.env.GOOGLE_API_KEY;

        if (!CX || !API_KEY) {
            throw new Error("Missing required environment variables: GOOGLE_SEARCH_ENGINE_ID or GOOGLE_API_KEY");
        }

        // You can use the lang parameter to customize the search if needed
        // For example, to restrict results to a specific language
        const searchOptions = {
            cx: CX,
            q: query,
            key: API_KEY
        };
        
        // Add language restriction if specified
        if (lang) {
            searchOptions.lr = lang.toLowerCase().startsWith('fr') ? 'lang_fr' : 'lang_en';
        }

        const res = await retryOnTransientError(
            () => customsearch.cse.list(searchOptions),
            {
                attempts: MAX_SEARCH_ATTEMPTS,
                baseDelayMs: RETRY_BASE_DELAY_MS,
                onRetry: (info) => {
                    console.warn(
                        `Google search attempt ${info.attempt} failed with a transient error, retrying:`,
                        maskSecretValue(info.error.message)
                    );
                    if (onRetry) onRetry(info);
                },
            }
        );

        const results = res.data;
        const extractedResults = extractSearchResults(results);
        return {
            results: extractedResults,
            provider: "google"
        };
    } catch (error) {
        const sanitizedError = sanitizeErrorForLogging(error);
        console.error("Error performing Google search:", sanitizedError);
        return {
            // Returning the failure as text rather than throwing is deliberate:
            // the answer agent sees that the search failed and can say so,
            // instead of the whole turn dying. `failed` exists because that
            // choice otherwise makes a failure indistinguishable from a
            // successful search to every caller — including the one that counts
            // errors for the technical metrics dashboard.
            failed: true,
            results: "Search failed: " + maskSecretValue(error.message),
            provider: "google"
        };
    }
};

export { contextSearch };
