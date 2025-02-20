import { google } from 'googleapis';
import { tool } from "@langchain/core/tools";

const customsearch = google.customsearch('v1');


/**
 * Extracts search results from Google Custom Search API response.
 * @param {object} results - The search results from Google Custom Search API.
 * @param {number} numResults - The number of top results to extract.
 * @returns {string} - The formatted top search results with summary, link, and link text.
 */
function extractSearchResults(results, numResults = 3) {
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

const contextSearch = async (query) => {
    const CX = process.env.GOOGLE_SEARCH_ENGINE_ID; // Ensure this is set in your environment variables
    const API_KEY = process.env.GOOGLE_API_KEY; // Ensure this is set in your environment variables

    const res = await customsearch.cse.list({
        cx: CX,
        q: query,
        key: API_KEY,
    });
    const results = res.data;
    const extractedResults = extractSearchResults(results);
    return {
        results: extractedResults,
        provider: "google"
    };

};

const contextSearchTool = tool(
    async ({ query }) => {
        return await contextSearch(query);
    },
    {
        name: "contextSearch",
        description: "Perform a search on Google Custom Search. Provide 'query' as the search term. Example input: { query: 'What is SCIS? Canada' }",
        schema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search term to query on.",
                },
            },
            required: ["query"],
        },
    }
);

export { contextSearchTool, contextSearch };