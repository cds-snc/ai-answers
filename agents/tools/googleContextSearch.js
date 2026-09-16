import { google } from 'googleapis';
import { retryOnTransientError } from '../../api/util/transient-retry.js';

const customsearch = google.customsearch('v1');
const MAX_SEARCH_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;

function maskSecretValue(text) {
    if (!text) return text;

    let masked = String(text);
    const apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey) {
        masked = masked.split(apiKey).join('[REDACTED]');
    }

    return masked
        .replace(/([?&](?:key|api[_-]?key)=)([^&\s]+)/gi, '$1[REDACTED]')
        .replace(/(authorization\s*[:=]\s*bearer\s+)([^\s,]+)/gi, '$1[REDACTED]')
        .replace(/(x-goog-api-key\s*[:=]\s*)([^\s,]+)/gi, '$1[REDACTED]')
        .replace(/(["']?(?:key|api[_-]?key)["']?\s*[:=]\s*["']?)([^"',\s}]+)/gi, '$1[REDACTED]');
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

function extractSearchResults(results, numResults = 3) {
    if (!results?.items?.length) {
        console.info('No search results found');
        return 'No results found.';
    }

    const extractedResults = results.items.slice(0, numResults).map((result) => (
        `Title: ${result.title}\nLink: ${result.link}\nSummary: ${result.snippet}\n`
    )).join('\n');
    console.info('Extracted search results:', extractedResults);
    return extractedResults;
}

/**
 * @returns {{ provider: 'google', results: string, failed?: true }}
 */
const contextSearch = async (query, lang, { onRetry } = {}) => {
    try {
        const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!searchEngineId || !apiKey) {
            throw new Error('Missing required environment variables: GOOGLE_SEARCH_ENGINE_ID or GOOGLE_API_KEY');
        }

        const searchOptions = {
            cx: searchEngineId,
            q: query,
            key: apiKey,
        };
        if (lang) {
            searchOptions.lr = lang.toLowerCase().startsWith('fr') ? 'lang_fr' : 'lang_en';
        }

        const response = await retryOnTransientError(
            () => customsearch.cse.list(searchOptions),
            {
                attempts: MAX_SEARCH_ATTEMPTS,
                baseDelayMs: RETRY_BASE_DELAY_MS,
                onRetry: (info) => {
                    console.warn(
                        `Google search attempt ${info.attempt} failed with a transient error, retrying:`,
                        maskSecretValue(info.error?.message)
                    );
                    if (onRetry) onRetry(info);
                },
            }
        );

        return {
            results: extractSearchResults(response.data),
            provider: 'google',
        };
    } catch (error) {
        console.error('Error performing Google search:', sanitizeErrorForLogging(error));
        return {
            failed: true,
            results: `Search failed: ${maskSecretValue(error.message)}`,
            provider: 'google',
        };
    }
};

export { contextSearch };
