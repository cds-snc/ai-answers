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
 * @param {string} query - The search query.
 * @param {string} lang - The language of the search query.
 * @returns {object|null} - The Coveo search results.
 */
async function contextSearch(query, lang) {
    // Set originLevel3 based on language
    const originLevel3 = lang && lang.toLowerCase().startsWith('fr') 
        ? '/fr/sr/srb.html' 
        : '/en/sr/srb.html';

    console.log(`Starting search with query: ${query} at endpoint: ${process.env.CANADA_CA_SEARCH_URI}`);
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
        throw new Error(`HTTP error! Status: ${response.status}, StatusText: ${response.statusText}`);
    }
    const extractedResults = extractSearchResults(await response.json());
    return {
        results: extractedResults,
        provider: "canadaca"
    };
}

export { contextSearch };
