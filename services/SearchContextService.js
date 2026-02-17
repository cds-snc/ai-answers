import { contextSearch as canadaContextSearch } from '../agents/tools/canadaCaContextSearch.js';
import { contextSearch as googleContextSearch } from '../agents/tools/googleContextSearch.js';
import { exponentialBackoff } from '../api/util/backoff.js';
import ServerLoggingService from './ServerLoggingService.js';
import { AgentOrchestratorService } from '../agents/AgentOrchestratorService.js';
import { createQueryRewriteAgent } from '../agents/AgentFactory.js';
import { queryRewriteStrategy } from '../agents/strategies/queryRewriteStrategy.js';

async function performSearch(query, lang, searchService = 'canadaca', chatId = 'system') {
    const searchFunction = searchService.toLowerCase() === 'google'
        ? googleContextSearch
        : canadaContextSearch;

    return await exponentialBackoff(() => searchFunction(query, lang));
}

export const SearchContextService = {
    async search({ chatId = 'system', searchService = 'canadaca', agentType = 'openai', referringUrl = '', translationData = null, pageLanguage = '' }) {
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

        const searchResults = await performSearch(searchQuery, lang, searchService, chatId);
        ServerLoggingService.debug('Search results:', chatId, searchResults);

        return {
            ...searchResults,
            ...rewriteResult,
            query: searchQuery,
        };
    }
};
