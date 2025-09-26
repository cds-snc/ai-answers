// src/ContextService.js
import loadContextSystemPrompt from './contextSystemPrompt.js';
import { getProviderApiUrl, getApiUrl } from '../utils/apiToUrl.js';
import LoggingService from './ClientLoggingService.js';
import { getFingerprint } from '../utils/fingerprint.js';



const ContextService = {
  prepareMessage: async (
    message,
    lang = 'en',
    department = '',
    referringUrl = '',
    searchResults = null,
    searchProvider = null,
    conversationHistory = [],
    chatId = 'system'
  ) => {
    await LoggingService.info(
      chatId,
      `Context Service: Processing message in ${lang.toUpperCase()}`
    );

    const SYSTEM_PROMPT = await loadContextSystemPrompt(lang, department);
    const messageWithReferrer = `${message}${referringUrl ? `\n<referring-url>${referringUrl}</referring-url>` : ''}`;

    return {
      message: messageWithReferrer,
      systemPrompt: SYSTEM_PROMPT,
      searchResults,
      searchProvider,
      conversationHistory,
      referringUrl,
      chatId,
    };
  },
 
  determineOutputLang: (pageLang, translationData) => {
    const originalLang = translationData && translationData.originalLanguage ? translationData.originalLanguage : 'eng';
    return pageLang === 'fr' ? 'fra' : originalLang;
  },

  sendMessage: async (
    aiProvider,
    message,
    lang = 'en',
    department = '',
    referringUrl,
    searchResults,
    searchProvider,
    conversationHistory = [],
    chatId = 'system'
  ) => {
    try {
      const messagePayload = await ContextService.prepareMessage(
        message,
        lang,
        department,
        referringUrl,
        searchResults,
        searchProvider,
        conversationHistory,
        chatId
      );
      await LoggingService.info(chatId, 'Calling context agent with:', { context: messagePayload });
      let url = getProviderApiUrl(aiProvider, 'context');
      const fp = await getFingerprint();
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-fp-id': fp,
        },
        body: JSON.stringify(messagePayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        await LoggingService.error(chatId, 'Context API error response:', { errorText });
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      await LoggingService.error(chatId, 'Error calling Context API:', error);
      throw error;
    }
  },

  contextSearch: async (message, searchProvider, lang = 'en', chatId = 'system', agentType = 'openai', referringUrl = '', translationData = null) => {
    try {
      const fp = await getFingerprint();
      const searchResponse = await fetch(getApiUrl('search-context'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-fp-id': fp,
          },
          body: JSON.stringify({
            message: message,
            lang: lang,
            searchService: searchProvider,
            chatId,
            agentType,
            referringUrl,
            translationData,
          
          }),
        });

      if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        await LoggingService.error(chatId, 'Search API error response:', { errorText });
        throw new Error(`HTTP error! status: ${searchResponse.status}`);
      }

      return await searchResponse.json();
    } catch (error) {
      await LoggingService.error(chatId, 'Error searching context:', error);
      throw error;
    }
  },
  deriveContext: async (
    aiProvider,
    question,
    lang = 'en',
    department = '',
    referringUrl,
    searchProvider,
    conversationHistory = [],
    chatId = 'system',
    translationData = null,
  ) => {
    try {
      await LoggingService.info(
        chatId,
        `Context Service: Analyzing question: page lang: ${lang}`
      );
      const searchResults = await ContextService.contextSearch(
        question,
        searchProvider,
        lang,
        chatId,
        aiProvider,
        referringUrl,
        translationData
      );
      await LoggingService.info(
        chatId,
        "Context Service: Agent Search completed:", searchResults
      );

      const { translatedText: translatedQuestion  } = translationData || {};
      // Extract agent values from searchResults
      const { query, results } = searchResults;

      const parsedContext = ContextService.parseContext(
        await ContextService.sendMessage(
          aiProvider,
          translatedQuestion,
          lang,
          department,
          referringUrl,
          results,
          searchProvider,
          conversationHistory,
          chatId
        )
      );
      // Add agent values to context object
      return {
        ...parsedContext,
        query,
        translatedQuestion,
        lang,
        outputLang : ContextService.determineOutputLang(lang, translationData), 
        originalLang: translationData.originalLanguage
      };
    } catch (error) {
      await LoggingService.error(chatId, 'Error deriving context:', error);
      throw error;
    }
  },
  parseContext: (context) => {
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
  },

};

export default ContextService;
