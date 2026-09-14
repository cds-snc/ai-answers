import { tool } from "@langchain/core/tools";
import {
    createSearchProviderError,
    normalizeSearchInput,
    SearchProviderError,
} from './searchProviderContract.js';

/**
 * Extracts search results from the Coveo Search API response.
 * @param {object} results - The Coveo search results object.
 * @param {number} numResults - The number of top results to extract.
 * @returns {string} - The formatted top search results with summary, link, and source organization.
 */
function extractSearchResults(results, numResults = 3) {
    let extractedResults = "";

    if (results && results.results) {
        results.results.slice(0, numResults).forEach((result) => {
            const link = result.clickUri;
            const linkText = result.title || "No title available";
            const summary = result.excerpt || "No summary available";
            const sourceOrganization = getSourceOrganization(result.raw);

            extractedResults += `Title: ${linkText}\nLink: ${link}\n`;
            if (sourceOrganization) {
                extractedResults += `Source organization: ${sourceOrganization}\n`;
            }
            extractedResults += `Summary: ${summary}\n\n`;
        });
    }

    return extractedResults || "No results found.";
}

/**
 * @param {string} query - The search query.
 * @param {string} lang - The language of the search query.
 * @returns {object|null} - The Coveo search results.
 */
async function contextSearch(query, lang) {
    const input = normalizeSearchInput(query, lang, 'canadaca');
    const searchUri = process.env.CANADA_CA_SEARCH_URI;
    const searchApiKey = process.env.CANADA_CA_SEARCH_API_KEY;
    if (!searchUri || !searchApiKey) {
        throw createSearchProviderError(
            'canadaca',
            'SEARCH_PROVIDER_CONFIG',
            'Canada.ca search is not configured'
        );
    }

    // Coveo uses locale to select language-aware ranking and stemming. Keep the
    // existing hub as the default, while allowing the deployment to override it
    // if Coveo confirms a different hub for this organization.
    const locale = input.lang.toLowerCase().startsWith('fr') ? 'fr-CA' : 'en-CA';
    const searchHub = process.env.CANADA_CA_SEARCH_HUB || 'canada-gouv-public-websites';

    console.log(`Starting search with query: ${input.query} at endpoint: ${searchUri}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(searchUri, {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Authorization": `Bearer ${searchApiKey}`,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                q: input.query,
                searchHub,
                locale,
                forwardLanguageToCoveoIndex: true,
            }),
        });

        if (!response.ok) {
            throw createSearchProviderError(
                'canadaca',
                'SEARCH_PROVIDER_HTTP',
                `Canada.ca search request failed with HTTP ${response.status}`,
                { status: response.status }
            );
        }

        return {
            results: extractSearchResults(await response.json()),
            provider: "canadaca"
        };
    } catch (error) {
        if (error instanceof SearchProviderError) throw error;
        throw createSearchProviderError(
            'canadaca',
            'SEARCH_PROVIDER_REQUEST',
            `Canada.ca search request failed: ${error.message}`
        );
    } finally {
        clearTimeout(timeout);
    }
}

function getSourceOrganization(raw = {}) {
    const sourceOrganization = raw.sysauthor || raw.author || raw['dcterms.creator'];
    if (Array.isArray(sourceOrganization)) {
        return sourceOrganization.filter((value) => typeof value === 'string' && value.trim()).join(', ');
    }
    return typeof sourceOrganization === 'string' && sourceOrganization.trim()
        ? sourceOrganization
        : '';
}

/**
 * canadaCASearch tool to perform a search using Coveo.
 */
const contextSearchTool = tool(
    async ({ lang, query }) => contextSearch(query, lang),
    {
        name: "contextSearch",
        description: "Perform a search on Canada.ca. Provide 'query' as the search term and 'lang' as the language of the search query.",
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
            required: ["query"],
        },
    }
);

export { contextSearchTool, contextSearch };
