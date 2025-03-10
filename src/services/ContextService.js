// src/ContextService.js
import loadContextSystemPrompt from './contextSystemPrompt.js';
import { getProviderApiUrl, getApiUrl } from '../utils/apiToUrl.js';
import LoggingService from './ClientLoggingService.js';

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
      let url = getProviderApiUrl(aiProvider, 'context');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

  contextSearch: async (message, searchProvider, lang = 'en', chatId = 'system') => {
    try {
      const searchResponse = await fetch(getApiUrl('search-context'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: message,
          lang: lang,
          searchService: searchProvider,
          chatId,
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
    chatId = 'system'
  ) => {
    try {
      await LoggingService.info(
        chatId,
        `Context Service: Analyzing question in ${lang.toUpperCase()}`
      );
      // TODO add referring URL to the context of the search?
      const searchResults = await ContextService.contextSearch(
        question,
        searchProvider,
        lang,
        chatId
      );
      await LoggingService.info(chatId, 'Executed Search:', {
        query: question,
        provider: searchProvider,
      });
      return ContextService.parseContext(
        await ContextService.sendMessage(
          aiProvider,
          question,
          lang,
          department,
          referringUrl,
          searchResults.results,
          searchProvider,
          conversationHistory,
          chatId
        )
      );
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

  deriveContextBatch: async (
    entries,
    lang = 'en',
    aiService = 'anthropic',
    batchName,
    searchProvider = 'google',
    chatId = 'batch'
  ) => {
    try {
      await LoggingService.info(
        chatId,
        `Context Service: Processing batch of ${entries.length} entries in ${lang.toUpperCase()}`
      );

      const searchResults = [];
      for (let i = 0; i < entries.length; i++) {
        if (searchProvider === 'canadaca') {
          await LoggingService.info(
            chatId,
            'Pausing for 10 seconds to avoid rate limits for canadaca...'
          );
          await new Promise((resolve) => setTimeout(resolve, 10000));
        }
        searchResults.push(
          await ContextService.contextSearch(
            entries[i]['REDACTEDQUESTION'],
            searchProvider,
            lang,
            chatId
          )
        );
      }

      const requests = await Promise.all(
        entries.map(async (entry, index) => {
          return ContextService.prepareMessage(
            entry['REDACTEDQUESTION'],
            lang,
            '', // department not provided in batch
            entry['REFERRINGURL'] || '',
            searchResults[index],
            searchProvider,
            [],
            chatId
          );
        })
      );

      const response = await ContextService.sendBatch(requests, aiService, batchName, lang);
      return {
        batchId: response.batchId,
        batchStatus: response.batchStatus,
      };
    } catch (error) {
      await LoggingService.error(chatId, 'Error deriving context batch:', error);
      throw error;
    }
  },

  sendBatch: async (requests, aiService, batchName, lang) => {
    try {
      await LoggingService.info('batch', `Context Service: Sending batch to ${aiService}`);
      const response = await fetch(getProviderApiUrl(aiService, 'batch-context'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests,
          aiService,
          batchName,
          lang,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        await LoggingService.error('batch', 'Context API batch error response:', { errorText });
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      await LoggingService.error('batch', 'Error calling Context API batch:', error);
      throw error;
    }
  },
};

export default ContextService;
