import ServerLoggingService from '../../../services/ServerLoggingService.js';
import { redactionService } from '../services/redactionService.js';
import { ScenarioOverrideService } from '../../../services/ScenarioOverrideService.js';
import { checkPII } from '../services/piiService.js';
import { validateShortQueryOrThrow, ShortQueryValidation } from '../services/shortQuery.js';
import { translateQuestion } from '../services/translationService.js';
import { graphRequestContext } from '../requestContext.js';
import { parseResponse, parseSentences } from '../services/answerService.js';
import { parseContextMessage } from '../services/contextService.js';

const API_BASE = process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || 3001}/api`;

class RedactionError extends Error {
  constructor(message, redactedText, redactedItems) {
    super(message);
    this.name = 'RedactionError';
    this.redactedText = redactedText;
    this.redactedItems = redactedItems;
  }
}

function getApiUrl(endpoint) {
  return `${API_BASE}/chat/${endpoint}`;
}

function getProviderApiUrl(provider, endpoint) {
  const normalized = provider === 'claude' ? 'anthropic' : provider === 'azure-openai' ? 'azure' : provider;
  return `${API_BASE}/${normalized}/${normalized}-${endpoint}`;
}

// Parsing functions removed - now using answerService.js and contextService.js
async function fetchJson(url, options = {}) {
  const ctx = graphRequestContext.getStore();
  const forwardedHeaders = ctx?.headers || {};

  const maxRetries = 3;
  const baseDelay = 100; // Start with 100ms

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Set a generous timeout for AI requests (5 minutes)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    try {
      if (attempt > 0) {
        console.log(`[fetchJson] Retry attempt ${attempt + 1}/${maxRetries} for: ${url}`);
      } else {
        console.log(`[fetchJson] Making request to: ${url}`);
      }
      console.log(`[fetchJson] Forwarded headers:`, Object.keys(forwardedHeaders));

      const resp = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Connection': 'keep-alive',
          ...forwardedHeaders,
          ...(options.headers || {}),
        },
        signal: options.signal || controller.signal,
        ...options,
      });

      clearTimeout(timeoutId);

      console.log(`[fetchJson] Response status: ${resp.status}`);

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Request failed (${resp.status}): ${text}`);
      }
      return resp.json();
    } catch (error) {
      clearTimeout(timeoutId);

      const isLastAttempt = attempt === maxRetries - 1;
      const isRetryableError = error.code === 'ECONNRESET' ||
        error.code === 'ECONNREFUSED' ||
        error.message?.includes('fetch failed');

      if (isRetryableError && !isLastAttempt) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[fetchJson] Retryable error (${error.code || error.message}), waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      console.error(`[fetchJson] Error calling ${url}:`, error.message, error.code);
      if (error.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after 5 minutes`);
      }
      throw error;
    }
  }
}

export class DefaultWithVectorServerWorkflow {
  async validateShortQuery(conversationHistory, userMessage, lang, department) {
    validateShortQueryOrThrow(conversationHistory, userMessage, lang, department);
  }

  async processRedaction(userMessage, lang, chatId, selectedAI) {
    await redactionService.ensureInitialized(lang);
    const { redactedText, redactedItems } = redactionService.redactText(userMessage, lang);
    const piiResult = await checkPII({ chatId, message: userMessage, agentType: selectedAI });
    if (piiResult.blocked) {
      throw new RedactionError('Blocked content detected', redactedText, redactedItems);
    }
    if (piiResult.pii !== null) {
      throw new RedactionError('PII detected in user message', redactedText, redactedItems);
    }
    return { redactedText, redactedItems };
  }

  async translateQuestion(text, lang, selectedAI, translationContext = []) {
    return translateQuestion({ text, desiredLanguage: lang, selectedAI, translationContext });
  }

  // Build translation context for server workflows: previous user messages (strings), excluding the most recent
  buildTranslationContext(conversationHistory = []) {
    if (!Array.isArray(conversationHistory)) return [];
    return (conversationHistory || [])
      .filter(m => m && m.sender === 'user' && !m.error && typeof m.text === 'string')
      .map(m => m.text || '');

  }

  determineOutputLang(pageLang, translationData) {
    const originalLang = translationData?.originalLanguage || 'eng';
    return pageLang === 'fr' ? 'fra' : originalLang;
  }

  async applyScenarioOverride({ context, departmentKey, overrideUserId, chatId }) {
    if (!context || !overrideUserId || !departmentKey) {
      return context;
    }
    try {
      const override = await ScenarioOverrideService.getActiveOverride(overrideUserId, departmentKey);
      if (override && override.overrideText) {
        await ServerLoggingService.info('Scenario override applied', chatId, {
          departmentKey,
          overrideId: override._id ? override._id.toString() : undefined,
        });
        return { ...context, systemPrompt: override.overrideText };
      }
    } catch (error) {
      await ServerLoggingService.warn('Scenario override lookup failed', chatId, {
        departmentKey,
        error: error?.message || error,
      });
    }
    return context;
  }

  async deriveContext({ selectedAI, translationData, lang, department, referringUrl, searchProvider, conversationHistory, chatId, overrideUserId, userMessage }) {
    const baseMessage = translationData?.translatedText || translationData?.originalText || userMessage || '';

    const searchPayload = {
      providedByInteractionId: null,
      chatId,
      searchService: searchProvider,
      agentType: selectedAI,
      referringUrl,
      translationData,
      lang,
    };

    const searchResult = await fetchJson(`${API_BASE}/search/search-context`, {
      method: 'POST',
      body: JSON.stringify(searchPayload),
    });

    const contextPayload = {
      chatId,
      message: baseMessage,
      systemPrompt: searchResult.systemPrompt || '',
      conversationHistory,
      searchResults: searchResult.results || searchResult.searchResults || [],
    };

    const contextResponse = await fetchJson(getApiUrl('chat-context'), {
      method: 'POST',
      body: JSON.stringify({ ...contextPayload, provider: selectedAI }),
    });

    // Use the service to parse the context response
    const parsed = parseContextMessage({
      message: contextResponse.message || '',
      searchResults: contextPayload.searchResults,
      searchProvider,
      model: contextResponse.model,
      inputTokens: contextResponse.inputTokens,
      outputTokens: contextResponse.outputTokens,
    });

    const contextData = {
      ...parsed,
      systemPrompt: contextPayload.systemPrompt || '',
      query: searchResult.query,
      translatedQuestion: translationData?.translatedText || baseMessage,
      lang,
      outputLang: this.determineOutputLang(lang, translationData),
      originalLang: translationData?.originalLanguage || lang,
    };

    const departmentKey = department || contextData.department;

    return await this.applyScenarioOverride({
      context: contextData,
      departmentKey,
      overrideUserId,
      chatId,
    });
  }

  async getContextForFlow({ conversationHistory, translationData, userMessage, lang, searchProvider, chatId, selectedAI, department, overrideUserId }) {
    const safeHistory = (conversationHistory || []).filter(m => m && !m.error);
    const cleanedHistory = safeHistory;
    const aiHistory = safeHistory.filter(m => m.sender === 'ai');
    const lastMessage = aiHistory.length > 0 ? aiHistory[aiHistory.length - 1] : null;

    const hasUsableExisting = (
      lastMessage &&
      lastMessage.interaction &&
      lastMessage.interaction.context &&
      lastMessage.interaction.context.searchQuery &&
      lastMessage.interaction.answer &&
      typeof lastMessage.interaction.answer.answerType === 'string' &&
      !lastMessage.interaction.answer.answerType.includes('question')
    );

    if (hasUsableExisting) {
      const context = { ...lastMessage.interaction.context };
      context.translatedQuestion = translationData?.translatedText || userMessage;
      context.originalLang = translationData?.originalLanguage || lang;
      context.outputLang = this.determineOutputLang(lang, translationData);
      const departmentKey = department || context.department;
      const updatedContext = await this.applyScenarioOverride({
        context,
        departmentKey,
        overrideUserId,
        chatId,
      });
      return { context: updatedContext, usedExistingContext: true, conversationHistory: aiHistory };
    }

    const minimalContext = {
      translatedQuestion: translationData?.translatedText || userMessage,
      originalLang: translationData?.originalLanguage || lang,
      searchProvider: searchProvider || '',
      systemPrompt: '',
    };

    return { context: minimalContext, usedExistingContext: false, conversationHistory: aiHistory };
  }

  buildShortCircuitPayload({ similarShortCircuit, startTime, endTime, translationData, userMessage, userMessageId, referringUrl, selectedAI, chatId, lang, searchProvider, contextOverride = null }) {
    const totalResponseTimeSC = endTime - startTime;
    const scContext = contextOverride || {
      translatedQuestion: translationData?.translatedText || userMessage,
      originalLang: translationData?.originalLanguage || lang,
      searchProvider: searchProvider || '',
    };

    const aiCitationUrl = similarShortCircuit.sourceCitation?.aiCitationUrl || similarShortCircuit.citationUrl || null;
    const providedCitationUrl = similarShortCircuit.sourceCitation?.providedCitationUrl || similarShortCircuit.citationUrl || null;
    const citationHead = similarShortCircuit.answer?.citationHead || similarShortCircuit.sourceCitation?.citationHead || null;

    const contentText = similarShortCircuit.answer?.content || (Array.isArray(similarShortCircuit.answer?.paragraphs) ? similarShortCircuit.answer.paragraphs.join('\n\n') : '') || '';
    const englishAnswerText = similarShortCircuit.answer?.englishAnswer
      || similarShortCircuit.englishAnswer
      || similarShortCircuit.answer?.content
      || contentText
      || '';
    const parsedSentences = parseSentences(contentText || '');

    return {
      selectedAI,
      question: userMessage,
      userMessageId,
      referringUrl,
      answer: {
        answerType: 'normal',
        content: similarShortCircuit.answer?.content,
        paragraphs: similarShortCircuit.answer?.paragraphs || [],
        sentences: parsedSentences,
        englishAnswer: englishAnswerText,
        citationHead,
        questionLanguage: translationData?.originalLanguage || lang,
        englishQuestion: translationData?.translatedText || userMessage,
        tools: [],
        citationUrl: aiCitationUrl,
      },
      finalCitationUrl: providedCitationUrl,
      confidenceRating: similarShortCircuit.confidenceRating || similarShortCircuit.similarity || null,
      context: scContext,
      chatId,
      pageLanguage: lang,
      responseTime: totalResponseTimeSC,
      searchProvider,
      // Optional: the matched chat and interaction identifiers (if available)
      instantAnswerChatId: similarShortCircuit.instantAnswerChatId || null,
      instantAnswerInteractionId: similarShortCircuit.instantAnswerInteractionId || null,
    };
  }

  async checkSimilarAnswer({ chatId, userMessage, conversationHistory, selectedAI, lang, detectedLang, searchProvider }) {
    const priorUserTurns = (conversationHistory || [])
      .filter(m => m && !m.error)
      .map(m => {
        if (m.sender === 'user' && typeof m.text === 'string' && m.text.trim()) return m.text.trim();
        if (m.interaction && typeof m.interaction.question === 'string' && m.interaction.question.trim()) return m.interaction.question.trim();
        if (typeof m.question === 'string' && m.question.trim()) return m.question.trim();
        return null;
      })
      .filter(Boolean);
    const questions = [...priorUserTurns, ...(typeof userMessage === 'string' && userMessage.trim() ? [userMessage.trim()] : [])];

    const similarJson = await fetchJson(getApiUrl('chat-similar-answer'), {
      method: 'POST',
      body: JSON.stringify({
        chatId,
        questions,
        selectedAI,
        pageLanguage: lang || null,
        detectedLanguage: detectedLang || null,
        searchProvider: searchProvider || null,
      }),
    });

    if (similarJson && similarJson.answer) {
      const answerText = similarJson.answer;
      const englishAnswerText = similarJson.englishAnswer || answerText;
      // Extract the instant-match ids returned by the API
      // Accept either the new instantAnswer* fields or legacy names
      const instantAnswerChatId = similarJson.instantAnswerChatId || similarJson.chatId || similarJson.providedByChatId || null;
      const instantAnswerInteractionId = similarJson.instantAnswerInteractionId || similarJson.interactionId || similarJson.providedByInteractionId || null;
      await ServerLoggingService.info(chatId, 'chat-similar-answer returned, short-circuiting workflow', {
        similar: similarJson,
        instantAnswerChatId,
        instantAnswerInteractionId
      });
      return {
        answer: {
          answerType: 'normal',
          content: answerText,
          paragraphs: [answerText],
          sentences: [answerText],
          englishAnswer: englishAnswerText,
          instantAnswerChatId: instantAnswerChatId,
          instantAnswerInteractionId: instantAnswerInteractionId,
          similarity: similarJson.similarity || null,
          citationHead: similarJson.citation?.citationHead || null,
        },
        context: null,
        question: userMessage,
        citationUrl: similarJson.citation?.providedCitationUrl || similarJson.citation?.aiCitationUrl || null,
        confidenceRating: similarJson.similarity || null,
        sourceCitation: similarJson.citation || null,
      };
    }

    return null;
  }

  async sendAnswerRequest({ selectedAI, conversationHistory, lang, context, referringUrl, chatId }) {
    const payload = {
      provider: selectedAI,
      message: context.translatedQuestion || context.translationData?.translatedText || '',
      conversationHistory,
      chatId,
      lang,
      department: context.department,
      topic: context.topic,
      topicUrl: context.topicUrl,
      departmentUrl: context.departmentUrl,
      searchResults: context.searchResults || [],
      scenarioOverrideText: context.systemPrompt || '',
      referringUrl,
    };

    const response = await fetchJson(getApiUrl('chat-message'), {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    // Use the service to parse the response
    const parsed = parseResponse(response.content || '');

    return {
      ...response,
      ...parsed,
      questionLanguage: context.originalLang,
      englishQuestion: context.translatedQuestion,
    };
  }

  async verifyCitation({ citationUrl, lang, question, department, translationF, chatId }) {
    const fallback = {
      isValid: false,
      url: null,
      fallbackUrl: null,
      confidenceRating: '0.1',
    };

    if (!citationUrl) {
      return fallback;
    }

    try {
      // Build query string
      const params = new URLSearchParams({ url: citationUrl });
      if (chatId) params.set('chatId', chatId);

      const result = await fetchJson(`${API_BASE}/util/util-check-url?${params.toString()}`);
      return {
        url: result.url || citationUrl,
        fallbackUrl: result.fallbackUrl || null,
        confidenceRating: result.confidenceRating?.toString() || '0.5',
      };
    } catch (error) {
      await ServerLoggingService.error('Citation validation failed', chatId, error);
      return fallback;
    }
  }

  async persistInteraction(interactionData) {
    await fetchJson(getApiUrl('chat-persist-interaction'), {
      method: 'POST',
      body: JSON.stringify(interactionData),
    });
  }
}

export { RedactionError, ShortQueryValidation };







