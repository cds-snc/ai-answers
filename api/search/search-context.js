import { contextSearch as canadaContextSearch } from '../../agents/tools/canadaCaContextSearch.js';
import { contextSearch as googleContextSearch } from '../../agents/tools/googleContextSearch.js';
import { exponentialBackoff } from '../../src/utils/backoff.js';
import ServerLoggingService from '../../services/ServerLoggingService.js';
import { AgentOrchestratorService } from '../../agents/AgentOrchestratorService.js';
import { createQueryRewriteAgent } from '../../agents/AgentFactory.js';
import { queryRewriteStrategy } from '../../agents/strategies/queryRewriteStrategy.js';
import { withSession } from '../../middleware/session.js';

async function performSearch(query, lang, searchService = 'canadaca', chatId = 'system') {
    const searchFunction = searchService.toLowerCase() === 'google' 
        ? googleContextSearch 
        : canadaContextSearch;
        
    return await exponentialBackoff(() => searchFunction(query, lang));
}

async function handler(req, res) {
    if (req.method === 'POST') {
        const { message, chatId = 'system', searchService = 'canadaca', agentType = 'openai', referringUrl = '', translationData = null, lang: pageLanguage = '' } = req.body;
        ServerLoggingService.info('Received request to search.', chatId, { searchService, referringUrl });

        try {
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
            // Merge agentResult values into the response
            res.json({
                ...searchResults,
                ...rewriteResult,
            });
        } catch (error) {
            ServerLoggingService.error('Error processing search:', chatId, error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }

}

export default withSession(handler);
