import { AgentOrchestratorService } from '../../../agents/AgentOrchestratorService.js';
import { createQueryRewriteAgent } from '../../../agents/AgentFactory.js';
import { queryRewriteStrategy } from '../../../agents/strategies/queryRewriteStrategy.js';
import { contextSearch as canadaContextSearch } from '../../../agents/tools/canadaCaContextSearch.js';
import { contextSearch as googleContextSearch } from '../../../agents/tools/googleContextSearch.js';
import { invokeContextAgent } from '../../../services/ContextAgentService.js';
import ServerLoggingService from '../../../services/ServerLoggingService.js';

async function exponentialBackoff(fn, retries = 5, initialDelay = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      await ServerLoggingService.error('Context search attempt failed', 'system', error);
      if (i < retries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

function determineOutputLang(pageLang, translationData) {
  const originalLang = translationData?.originalLanguage || 'eng';
  return pageLang === 'fr' ? 'fra' : originalLang;
}

function parseContextMessage(context) {
  const topicMatch = context.message.match(/<topic>([\s\S]*?)<\/topic>/);
  const topicUrlMatch = context.message.match(/<topicUrl>([\s\S]*?)<\/topicUrl>/);
  const departmentMatch = context.message.match(/<department>([\s\S]*?)<\/department>/);
  const departmentUrlMatch = context.message.match(/<departmentUrl>([\s\S]*?)<\/departmentUrl>/);

  return {
    topic: topicMatch ? topicMatch[1] : null,
    topicUrl: topicUrlMatch ? topicUrlMatch[1] : null,
    department: departmentMatch ? departmentMatch[1] : null,
    departmentUrl: departmentUrlMatch ? departmentUrlMatch[1] : null,
    searchResults: context.searchResults,
    searchProvider: context.searchProvider,
    model: context.model,
    inputTokens: context.inputTokens,
    outputTokens: context.outputTokens,
  };
}

async function performSearch(query, lang, searchService = 'canadaca', chatId = 'system') {
  const searchFn = searchService?.toLowerCase() === 'google' ? googleContextSearch : canadaContextSearch;
  return exponentialBackoff(() => searchFn(query, lang), 5, 500);
}

export async function deriveContext({
  agentType,
  translatedQuestion,
  pageLang = 'en',
  department = '',
  referringUrl = '',
  searchProvider = 'canadaca',
  conversationHistory = [],
  chatId = 'system',
  translationData = null,
}) {
  await ServerLoggingService.info('ContextService: deriving context', chatId, { searchProvider, pageLang });

  const rewrite = await AgentOrchestratorService.invokeWithStrategy({
    chatId,
    agentType,
    request: { translationData, referringUrl, pageLanguage: pageLang },
    createAgentFn: createQueryRewriteAgent,
    strategy: queryRewriteStrategy,
  });

  const searchQuery = rewrite?.query || translatedQuestion;
  const langForSearch = pageLang.toLowerCase().includes('fr') ? 'fr' : 'en';
  const searchResults = await performSearch(searchQuery, langForSearch, searchProvider, chatId);

  const contextResponse = await invokeContextAgent(agentType, {
    chatId,
    message: translatedQuestion,
    systemPrompt: rewrite?.systemPrompt || '',
    searchResults,
    conversationHistory,
  });

  const parsed = parseContextMessage({
    message: contextResponse?.message || '',
    searchResults,
    searchProvider,
    model: contextResponse?.model,
    inputTokens: contextResponse?.inputTokens,
    outputTokens: contextResponse?.outputTokens,
  });

  return {
    ...parsed,
    query: searchQuery,
    translatedQuestion,
    lang: pageLang,
    outputLang: determineOutputLang(pageLang, translationData),
    originalLang: translationData?.originalLanguage || pageLang,
  };
}
