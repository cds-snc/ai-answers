import ServerLoggingService from '../../../services/ServerLoggingService.js';
import { redactionService } from '../services/redactionService.js';
import { ScenarioOverrideService } from '../../../services/ScenarioOverrideService.js';
import { checkPII } from '../services/piiService.js';
import { validateShortQueryOrThrow, ShortQueryValidation } from '../services/shortQuery.js';
import { translateQuestion } from '../services/translationService.js';
import { graphRequestContext } from '../requestContext.js';

const API_BASE = process.env.INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 3001}/api`;

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

function parseSentences(text) {
  const sentenceRegex = /<s-(\d+)>(.*?)<\/s-\d+>/g;
  const sentences = [];
  let match;
  while ((match = sentenceRegex.exec(text)) !== null) {
    const index = parseInt(match[1], 10) - 1;
    if (index >= 0 && index < 4 && match[2].trim()) {
      sentences[index] = match[2].trim();
    }
  }
  if (sentences.length === 0 && text.trim()) {
    sentences[0] = text.trim();
  }
  return Array(4).fill('').map((_, i) => sentences[i] || '');
}


function parseParagraphs(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .split(/(?:\r?\n){2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function parseAnswerResponse(rawText = '') {
  if (!rawText) {
    return {
      answerType: 'normal',
      content: '',
      paragraphs: [],
      sentences: parseSentences(''),
      citationHead: null,
      citationUrl: null,
      confidenceRating: null,
      englishAnswer: null,
    };
  }

  let answerType = 'normal';
  let content = rawText;
  let englishAnswer = null;
  let citationHead = null;
  let citationUrl = null;
  let confidenceRating = null;

  const stripTag = (str, regex) => str.replace(regex, '').trim();

  const preliminaryRegex = /<preliminary-checks>[\s\S]*?<\/preliminary-checks>/gi;
  content = stripTag(content, preliminaryRegex);

  const confidenceMatch = /<confidence>([\s\S]*?)<\/confidence>/i.exec(content);
  if (confidenceMatch) {
    confidenceRating = confidenceMatch[1].trim();
    content = stripTag(content, /<confidence>[\s\S]*?<\/confidence>/i);
  }

  const citationHeadMatch = /<citation-head>([\s\S]*?)<\/citation-head>/i.exec(content);
  if (citationHeadMatch) {
    citationHead = citationHeadMatch[1].trim();
    content = stripTag(content, /<citation-head>[\s\S]*?<\/citation-head>/i);
  }

  const citationUrlMatch = /<citation-url>([\s\S]*?)<\/citation-url>/i.exec(content);
  if (citationUrlMatch) {
    citationUrl = citationUrlMatch[1].trim();
    content = stripTag(content, /<citation-url>[\s\S]*?<\/citation-url>/i);
  }

  const englishMatch = /<english-answer>([\s\S]*?)<\/english-answer>/i.exec(content);
  if (englishMatch) {
    englishAnswer = englishMatch[1].trim();
    content = stripTag(content, /<english-answer>[\s\S]*?<\/english-answer>/i);
  }

  const answerBlock = /<answer>([\s\S]*?)<\/answer>/i.exec(content);
  if (answerBlock) {
    content = answerBlock[1].trim();
  }

  const specialTags = {
    'not-gc': /<not-gc>([\s\S]*?)<\/not-gc>/i,
    'pt-muni': /<pt-muni>([\s\S]*?)<\/pt-muni>/i,
    'clarifying-question': /<clarifying-question>([\s\S]*?)<\/clarifying-question>/i,
  };

  for (const [type, regex] of Object.entries(specialTags)) {
    const match = regex.exec(content);
    if (match) {
      content = stripTag(content, regex);
      answerType = type;
    }
  }

  const paragraphs = parseParagraphs(content);
  const sentences = parseSentences(content);

  return {
    answerType,
    content: content.trim(),
    paragraphs,
    sentences,
    citationHead,
    citationUrl,
    confidenceRating,
    englishAnswer,
  };
}
async function fetchJson(url, options = {}) {
  const ctx = graphRequestContext.getStore();
  const forwardedHeaders = ctx?.headers || {};
  const resp = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...forwardedHeaders,
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Request failed (${resp.status}): ${text}`);
  }
  return resp.json();
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

    const contextResponse = await fetchJson(getProviderApiUrl(selectedAI, 'context'), {
      method: 'POST',
      body: JSON.stringify(contextPayload),
    });

    const parseField = (pattern) => {
      const match = contextResponse.content?.match(pattern);
      return match ? match[1] : null;
    };

    const contextData = {
      topic: parseField(/<topic>([\s\S]*?)<\/topic>/),
      topicUrl: parseField(/<topicUrl>([\s\S]*?)<\/topicUrl>/),
      department: parseField(/<department>([\s\S]*?)<\/department>/),
      departmentUrl: parseField(/<departmentUrl>([\s\S]*?)<\/departmentUrl>/),
      searchResults: contextPayload.searchResults,
      systemPrompt: contextPayload.systemPrompt || '',
      searchProvider,
      model: contextResponse.model,
      inputTokens: contextResponse.inputTokens,
      outputTokens: contextResponse.outputTokens,
      query: searchResult.query,
      translatedQuestion: translationData?.translatedText || baseMessage,
      lang,
      outputLang: this.determineOutputLang(lang, translationData),
      originalLang: translationData.originalLanguage,
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
      // Prefer exposing the source chatId for traceability; fall back to interactionId
      const providedByChatId = similarJson.chatId || similarJson.interactionId || null;
      await ServerLoggingService.info(chatId, 'chat-similar-answer returned, short-circuiting workflow', {
        similar: similarJson,
        providedByChatId
      });
      return {
        answer: {
          answerType: 'normal',
          content: answerText,
          paragraphs: [answerText],
          sentences: [answerText],
          providedByChatId: providedByChatId,
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
      message: context.translatedQuestion || context.translationData?.translatedText || '',
      systemPrompt: context.systemPrompt || '',
      conversationHistory,
      chatId,
      context,
      referringUrl,
      lang,
    };

    const response = await fetchJson(getProviderApiUrl(selectedAI, 'message'), {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const parsed = parseAnswerResponse(response.content || '');

    return {
      ...response,
      ...parsed,
      paragraphs: parsed.paragraphs || parseParagraphs(response.content || ''),
      sentences: parsed.sentences || parseSentences(response.content || ''),
      citationHead: parsed.citationHead ?? response.citationHead ?? null,
      citationUrl: response.citationUrl ?? parsed.citationUrl ?? null,
      confidenceRating: parsed.confidenceRating ?? response.confidenceRating ?? null,
      tools: response.tools || [],
      questionLanguage: context.originalLang,
      englishQuestion: context.translatedQuestion,
    };
  }

  async verifyCitation({ citationUrl, lang, question, department, translationF, chatId }) {
    const fallback = {
      isValid: false,
      fallbackUrl: null,
      confidenceRating: '0.1',
    };

    if (!citationUrl) {
      return fallback;
    }

    const searchUrl = new URL('util-check-url', API_BASE);
    searchUrl.searchParams.set('url', citationUrl);
    if (chatId) searchUrl.searchParams.set('chatId', chatId);

    try {
      const result = await fetchJson(searchUrl.toString());
      return {
        url: result.url || citationUrl,
        fallbackUrl: result.fallbackUrl,
        confidenceRating: result.confidenceRating || '0.5',
      };
    } catch (error) {
      await ServerLoggingService.error('Citation validation failed', chatId, error);
      return fallback;
    }
  }

  async persistInteraction(interactionData) {
    await fetchJson(`${API_BASE}/db/db-persist-interaction`, {
      method: 'POST',
      body: JSON.stringify(interactionData),
    });
  }
}

export { RedactionError, ShortQueryValidation };







