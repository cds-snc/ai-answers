import { contextSearch as canadaContextSearch } from '../agents/tools/canadaCaContextSearch.js';
import { contextSearch as googleContextSearch } from '../agents/tools/googleContextSearch.js';
import ServerLoggingService from './ServerLoggingService.js';
import ServiceCallMetricsService from './ServiceCallMetricsService.js';
import { AgentOrchestratorService } from '../agents/AgentOrchestratorService.js';
import { createQueryRewriteAgent } from '../agents/AgentFactory.js';
import { queryRewriteStrategy } from '../agents/strategies/queryRewriteStrategy.js';

async function performSearch(query, lang, searchService = 'canadaca', chatId = 'system') {
    const provider = searchService.toLowerCase() === 'google' ? 'google' : 'canadaca';
    const searchFunction = provider === 'google' ? googleContextSearch : canadaContextSearch;

    // Retry lives inside each search tool, not here: only the tool can tell a
    // dropped socket or a 5xx from a 404 or a bad API key, and a wrapper at this
    // level would retry all four — spending seconds of an interactive answer to
    // return the same permanent error. The tools call back here on each attempt
    // so the retry metric still gets recorded.
    try {
        const result = await searchFunction(query, lang, {
            // Fire-and-forget — not awaited, see ServiceCallMetricsService's contract.
            onRetry: () => ServiceCallMetricsService.recordRetry({ service: 'search', type: provider }),
        });
        // The two providers report a spent-all-retries failure differently:
        // canadaca throws (caught below), google returns `failed` with the error
        // as its result text so the answer agent can still say the search failed.
        // Both are errors for metrics purposes — the dashboard's own note defines
        // this count as "calls that still failed after all retries".
        if (result?.failed) {
            ServiceCallMetricsService.recordError({ service: 'search', type: provider });
        }
        return result;
    } catch (error) {
        ServiceCallMetricsService.recordError({ service: 'search', type: provider });
        throw error;
    }
}

function countSearchResults(resultsString) {
    if (!resultsString || resultsString === 'No results found.') return 0;
    // Coveo results use "Summary:", Google results use "Title:"
    const summaryCount = (resultsString.match(/^Summary: /gm) || []).length;
    const titleCount = (resultsString.match(/^Title: /gm) || []).length;
    return Math.max(summaryCount, titleCount);
}

export const SearchContextService = {
    async search({ chatId = 'system', searchService = 'canadaca', agentType = 'openai-gpt51', referringUrl = '', translationData = null, pageLanguage = '' }) {
        ServerLoggingService.info('Received request to search.', chatId, { searchService, referringUrl });

        const pageLang = (pageLanguage || '').toLowerCase();
        const originalLang = (translationData && translationData.originalLanguage) ? String(translationData.originalLanguage).toLowerCase() : '';
        const lang = (pageLang.includes('fr') || originalLang.includes('fr')) ? 'fr' : 'en';

        const orchestratorRequest = { translationData, referringUrl, pageLanguage: lang };
        const rewriteResult = await AgentOrchestratorService.invokeWithStrategy({
            chatId,
            agentType,
            request: orchestratorRequest,
            createAgentFn: createQueryRewriteAgent,
            strategy: queryRewriteStrategy,
        });
        const searchQuery = rewriteResult.query;
        ServerLoggingService.info('SearchContextAgent rewrite result:', chatId, { pageLanguage, ...rewriteResult });

        let searchResults = await performSearch(searchQuery, lang, searchService, chatId);
        ServerLoggingService.debug('Search results:', chatId, searchResults);

        // Retry with a simplified query if search returned 0 or 1 results
        const resultCount = countSearchResults(searchResults?.results);
        if (resultCount <= 1) {
            try {
                ServerLoggingService.info('Search returned too few results, retrying with simplified query', chatId, {
                    failedQuery: searchQuery,
                    resultCount,
                });

                const retryRequest = { translationData, referringUrl, pageLanguage: lang, failedQuery: searchQuery };
                const retryRewrite = await AgentOrchestratorService.invokeWithStrategy({
                    chatId,
                    agentType,
                    request: retryRequest,
                    createAgentFn: createQueryRewriteAgent,
                    strategy: queryRewriteStrategy,
                });
                const retryQuery = retryRewrite.query;
                ServerLoggingService.info('SearchContextAgent retry rewrite result:', chatId, { retryQuery, originalFailedQuery: searchQuery });

                const retryResults = await performSearch(retryQuery, lang, searchService, chatId);
                const retryCount = countSearchResults(retryResults?.results);
                ServerLoggingService.info('Retry search results:', chatId, { retryQuery, retryResultCount: retryCount });

                // Use retry results if they're better, otherwise keep original
                if (retryCount > resultCount) {
                    return {
                        ...retryResults,
                        ...retryRewrite,
                        query: retryQuery,
                    };
                }
            } catch (retryError) {
                ServerLoggingService.error('Search retry failed, using original results', chatId, retryError);
            }
        }

        return {
            ...searchResults,
            ...rewriteResult,
            query: searchQuery,
        };
    }
};
