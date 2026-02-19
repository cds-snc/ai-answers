import ServerLoggingService from '../../../services/ServerLoggingService.js';
import { redactionService } from '../services/redactionService.js';
import { ScenarioOverrideService } from '../../../services/ScenarioOverrideService.js';
import { checkPII } from '../services/piiService.js';
import { validateShortQueryOrThrow, ShortQueryValidation } from '../services/shortQuery.js';
import { translateQuestion as translateService } from '../services/translationService.js';
import { parseResponse, parseSentences } from '../services/answerService.js';
import { parseContextMessage } from '../services/contextService.js';

// Services for direct invocation
import { SearchContextService } from '../../../services/SearchContextService.js';
import { AnswerGenerationService } from '../../../services/AnswerGenerationService.js';
import { SimilarAnswerService } from '../../../services/SimilarAnswerService.js';
import { UrlValidationService } from '../../../services/UrlValidationService.js';
import { InteractionPersistenceService } from '../../../services/InteractionPersistenceService.js';
import { invokeContextAgent } from '../../../services/ContextAgentService.js';
import { exponentialBackoff } from '../../../api/util/backoff.js';

// Extract URLs that were successfully downloaded during the answer step
function getVerifiedUrls(tools) {
  if (!Array.isArray(tools)) return new Set();
  return new Set(
    tools
      .filter(t => t.tool === 'downloadWebPage' && t.status === 'completed')
      .map(t => {
        try { return JSON.parse(t.input)?.url; } catch { return null; }
      })
      .filter(Boolean)
  );
}

// RedactionError class
class RedactionError extends Error {
  constructor(message, redactedText, redactedItems) {
    super(message);
    this.name = 'RedactionError';
    this.redactedText = redactedText;
    this.redactedItems = redactedItems;
  }
}

export class GraphWorkflowHelper {
  async validateShortQuery(conversationHistory, userMessage, lang, department) {
    validateShortQueryOrThrow(conversationHistory, userMessage, lang, department);
  }

  async processRedaction(userMessage, lang, chatId, selectedAI) {
    await redactionService.ensureInitialized(lang);
    const { redactedText, redactedItems } = redactionService.redactText(userMessage, lang);

    // Check if any blocking-type redactions were applied (profanity, threat, manipulation)
    const blockingTypes = ['profanity', 'threat', 'manipulation', 'private'];
    const hasBlockingRedaction = redactedItems.some(item => blockingTypes.includes(item.type));
    if (hasBlockingRedaction) {
      throw new RedactionError('Blocked content detected', redactedText, redactedItems);
    }

    const piiResult = await checkPII({ chatId, message: userMessage, agentType: selectedAI });
    if (piiResult.blocked) {
      throw new RedactionError('Blocked content detected in translation', '#############', redactedItems);
    }
    if (piiResult.pii !== null) {
      // Use the PII-aware redaction string returned by the PII checker
      throw new RedactionError('PII detected in user message', piiResult.pii, redactedItems);
    }
    return { redactedText, redactedItems };
  }

  async translateQuestion(text, lang, selectedAI, translationContext = []) {
    const resp = await translateService({ text, desiredLanguage: lang, selectedAI, translationContext });
    if (resp && resp.blocked === true) {
      await ServerLoggingService.info('translate blocked - graph workflow', null, { resp });
      throw new RedactionError('Blocked content detected in translation', '#############', null);
    }
    return resp;
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
      chatId,
      searchService: searchProvider,
      agentType: selectedAI,
      referringUrl,
      translationData,
      pageLanguage: lang,
    };

    const searchResult = await SearchContextService.search(searchPayload);

    const contextPayload = {
      chatId,
      message: baseMessage,
      systemPrompt: searchResult.systemPrompt || '',
      conversationHistory,
      searchResults: searchResult.results || searchResult.searchResults || [],
      provider: selectedAI,
      language: lang,
    };

    // Invoke Context Agent via Service directly
    const contextResponse = await exponentialBackoff(() => invokeContextAgent(selectedAI, contextPayload));

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
      searchQuery: searchResult.query || searchResult.searchQuery || contextPayload.searchResults?.query || '',
      translatedQuestion: translationData?.translatedText || baseMessage,
      lang,
      outputLang: this.determineOutputLang(lang, translationData),
      originalLang: translationData?.originalLanguage || lang,
      originalUserMessage: userMessage,
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
      return { context: updatedContext, usedExistingContext: true, conversationHistory: safeHistory };
    }

    const minimalContext = {
      translatedQuestion: translationData?.translatedText || userMessage,
      originalLang: translationData?.originalLanguage || lang,
      searchProvider: searchProvider || '',
      systemPrompt: '',
    };

    return { context: minimalContext, usedExistingContext: false, conversationHistory: safeHistory };
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

    const similarJson = await SimilarAnswerService.findSimilarAnswer({
      chatId,
      questions,
      selectedAI,
      pageLanguage: lang || null,
      detectedLanguage: detectedLang || null,
    }); // removed searchProvider arg as service didn't seem to take it, or it was implicit? original helper passed it.
    // Checked service: findSimilarAnswer({ chatId, questions, selectedAI, recencyDays, requestedRating, pageLanguage, detectedLanguage })
    // It does NOT take searchProvider. So that's fine.

    if (similarJson && similarJson.answer) {
      const answerText = similarJson.answer;
      const englishAnswerText = similarJson.englishAnswer || answerText;
      // Extract the instant-match ids returned by the API
      // Service returns { formatted.interactionId, formatted.chatId } which map to similarJson.interactionId and similarJson.chatId
      const instantAnswerChatId = similarJson.instantAnswerChatId || similarJson.chatId || null;
      const instantAnswerInteractionId = similarJson.instantAnswerInteractionId || similarJson.interactionId || null;
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
        sourceCitation: similarJson.citation || null,
      };
    }

    return null;
  }

  async sendAnswerRequest({ selectedAI, conversationHistory, lang, context, referringUrl, chatId }) {
    const normalizeOutputLang = (l) => {
      if (!l) return '';
      const m = String(l).toLowerCase();
      if (m === 'fr' || m === 'fra') return 'fra';
      if (m === 'en' || m === 'eng') return 'eng';
      return m;
    };

    const baseMessage = context.translatedQuestion || context.translationData?.translatedText || '';
    const outputLangToken = normalizeOutputLang(context.outputLang || context.originalLang || lang);
    const header = `\n<output-lang>${outputLangToken}</output-lang>`;
    let message = `${baseMessage}${header}`;
    message = `${message}${referringUrl && String(referringUrl).trim() ? `\n<referring-url>${String(referringUrl).trim()}</referring-url>` : ''}`;

    const payload = {
      provider: selectedAI,
      message: message,
      conversationHistory,
      // Ensure the generator receives the normalized desired output language
      lang: context.outputLang || context.originalLang || lang,
      department: context.department,
      topic: context.topic,
      topicUrl: context.topicUrl,
      departmentUrl: context.departmentUrl,
      searchResults: context.searchResults || [],
      scenarioOverrideText: context.systemPrompt || '',
      similarQuestions: context.similarQuestions || '',
      referringUrl,
      originalMessage: context.originalUserMessage,
    };

    // Call service directly
    // generateAnswer(params, chatId)
    const response = await AnswerGenerationService.generateAnswer(payload, chatId);

    // Use the service to parse the response
    const parsed = parseResponse(response.content || '');

    return {
      ...response,
      ...parsed,
      questionLanguage: context.originalLang,
      englishQuestion: context.translatedQuestion,
    };
  }

  async verifyCitation({ citationUrl, lang, question, department, translationF, chatId, tools }) {
    const fallback = {
      isValid: false,
      url: null,
      fallbackUrl: null,
    };

    if (!citationUrl) {
      return fallback;
    }

    try {
      // Extract URLs that were already successfully fetched during the answer step
      const verifiedUrls = getVerifiedUrls(tools);

      const isCanadaCa = citationUrl.startsWith('https://www.canada.ca') || citationUrl.startsWith('http://www.canada.ca');

      // URLs already downloaded by the tool are trusted — skip live check
      if (verifiedUrls.has(citationUrl)) {
        return { url: citationUrl, fallbackUrl: null };
      }

      // canada.ca URLs that were NOT previously fetched need a live check
      // to catch hallucinated URLs
      if (isCanadaCa) {
        const liveResult = await UrlValidationService.validateUrl(citationUrl, chatId);
        if (liveResult.isValid) {
          return { url: liveResult.url || citationUrl, fallbackUrl: null };
        }
        // Live check failed — generate a search fallback
        const result = await UrlValidationService.validateUrlFormatting(
          null, lang, question, department, translationF, chatId
        );
        return { url: null, fallbackUrl: result.fallbackUrl || null };
      }

      // Non-canada.ca URLs (from search results / scenarios) — pass through
      return { url: citationUrl, fallbackUrl: null };
    } catch (error) {
      await ServerLoggingService.error('Citation validation failed', chatId, error);
      return fallback;
    }
  }

  async persistInteraction(interactionData, user) {
    // Note: Graph must pass user object now
    await InteractionPersistenceService.persistInteraction(
      interactionData.chatId, // Assuming chatId is in interactionData or I need to pass it?
      interactionData,
      user
    );
  }
}

export { RedactionError, ShortQueryValidation };
