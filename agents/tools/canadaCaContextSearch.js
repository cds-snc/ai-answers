import { tool } from "@langchain/core/tools";
import { retryOnTransientError } from '../../api/util/transient-retry.js';

const MAX_SEARCH_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;

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

/**
 * Extracts search results from the Coveo Search API response.
 * @param {object} results - The Coveo search results object.
 * @param {number} numResults - The number of top results to extract.
 * @returns {string} - The formatted top search results with summary, link, and link text.
 */
function extractSearchResults(results, numResults = 3) {
    let extractedResults = "";

    if (results && results.results) {
        results.results.slice(0, numResults).forEach((result) => {
            const link = result.clickUri;
            const linkText = result.title || "No title available";
            const summary = result.excerpt || "No summary available";

            extractedResults += `Summary: ${summary}\nLink: ${link}\nLink Text: ${linkText}\n\n`;
        });
    }

    return extractedResults || "No results found.";
}

/**
 * One attempt at the Coveo call. Separated from contextSearch so the retry
 * wrapper has a single unit to repeat: the request, the status check, and the
 * body read all belong to it, because a response can start 200 and then have
 * its body stream die.
 */
async function fetchSearchResults(query, originLevel3) {
    const response = await fetch(process.env.CANADA_CA_SEARCH_URI, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.CANADA_CA_SEARCH_API_KEY}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({ 
            q: query,
            searchHub: "canada-gouv-public-websites",
            originLevel3: originLevel3
        }),
        timeout: 30000 // 30 seconds timeout
    });

    if (!response.ok) {
        // Try to log the full error response
        const errorBody = await response.text();
        console.error("HTTP Error Response:", {
            status: response.status,
            statusText: response.statusText,
            body: errorBody
        });
        const error = new Error(`HTTP error! Status: ${response.status}, StatusText: ${response.statusText}`);
        // fetch reports the status on the response, not the error. Without this
        // the retry wrapper sees a bare Error and treats a 503 as permanent.
        error.status = response.status;
        throw error;
    }
    return await response.json();
}

/**
 * Unlike googleContextSearch, this throws once its retries are spent instead of
 * degrading gracefully, and nothing up the chain catches it: not performSearch
 * (it rethrows), not SearchContextService.search (its first performSearch call
 * is unwrapped), not GraphWorkflowHelper.deriveContext, not any of the graphs
 * that call it. So a Coveo outage fails the whole turn, while a Google outage
 * returns `failed: true` with "Search failed:" as the result text and lets the
 * answer agent tell the user the search failed.
 *
 * That asymmetry is not deliberate — it is just how the two tools grew. Worth
 * settling when we get direct API access: match Google's contract here
 * (`{ failed: true, results: "Search failed: ..." }`) so a search outage
 * degrades instead of dropping the answer. Note that SearchContextService's
 * error metric already handles both shapes, so only this function has to change.
 *
 * @param {string} query - The search query.
 * @param {string} lang - The language of the search query.
 * @param {object} [options]
 * @param {(info: {error: unknown, attempt: number, attempts: number}) => void} [options.onRetry]
 *   Called before each retry so a caller can record the attempt (see
 *   SearchContextService). Best-effort telemetry only.
 * @returns {object|null} - The Coveo search results.
 */
async function contextSearch(query, lang, { onRetry } = {}) {
    // Set originLevel3 based on language
    const originLevel3 = lang && lang.toLowerCase().startsWith('fr') 
        ? '/fr/sr/srb.html' 
        : '/en/sr/srb.html';

    console.log(`Starting search with query: ${query} at endpoint: ${process.env.CANADA_CA_SEARCH_URI}`);

    // A dropped socket or a 5xx gets another attempt; a 4xx or a bad API key
    // fails immediately rather than sleeping 3s to return the same error.
    const results = await retryOnTransientError(
        () => fetchSearchResults(query, originLevel3),
        {
            attempts: MAX_SEARCH_ATTEMPTS,
            baseDelayMs: RETRY_BASE_DELAY_MS,
            maxElapsedMs: RETRY_TIME_BUDGET_MS,
            onRetry: (info) => {
                console.warn(
                    `Canada.ca search attempt ${info.attempt}/${info.attempts} failed with a transient error, retrying:`,
                    info.error?.message
                );
                if (onRetry) onRetry(info);
            },
        }
    );

    const extractedResults = extractSearchResults(results);
    return {
        results: extractedResults,
        provider: "canadaca"
    };
}

/**
 * canadaCASearch tool to perform a search using Coveo.
 */
const contextSearchTool = tool(
    async ({ lang, query, searchService = 'canadaca' }) => {
        try {
            console.log(`Starting ${searchService} search with query: ${query} in language: ${lang}`);

            const results = await contextSearch(query, lang);

            if (!results) {
                return `Failed to retrieve search results for query: ${query}`;
            }

            const extractedResults = extractSearchResults(results);
            console.log(`Results returned for query: ${query}`);
            return extractedResults || `No meaningful results extracted for query: ${query}`;
        } catch (error) {
            console.error(`Error processing search query: ${query}. Details: ${error.message}`);
            return `An error occurred while processing the search query: ${query}`;
        }
    },
    {
        name: "canadaCASearch",
        description: "Perform a search using Coveo or Google. Provide the 'query' as the search term and lang as the language of the search query.",
        schema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search term to query.",
                },
                lang: {
                    type: "string",
                    description: "The language of the search query.",
                }
            },
            required: ["lang", "query"],
        },
    }
);

export { contextSearchTool, contextSearch };
