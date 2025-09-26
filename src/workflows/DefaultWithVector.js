import ContextService from '../services/ContextService.js';
import AnswerService from '../services/AnswerService.js';
import DataStoreService from '../services/DataStoreService.js';
import LoggingService from '../services/ClientLoggingService.js';
import { getApiUrl } from '../utils/apiToUrl.js';


import { ChatWorkflowService, WorkflowStatus } from '../services/ChatWorkflowService.js';
import { getFingerprint } from '../utils/fingerprint.js';

export class DefaultWithVector {
  constructor() { }



  async processResponse(
    chatId,
    userMessage,
    userMessageId,
    conversationHistory,
    lang,
    department,
    referringUrl,
    selectedAI,
    translationF,
    onStatusUpdate,
    searchProvider
  ) {
    const startTime = Date.now();
    await LoggingService.info(chatId, 'Starting DefaultWithVector with data:', {
      lang,
      referringUrl,
      selectedAI,
      startTime
    });
    ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.MODERATING_QUESTION);
    // Log that validation is about to run
    await LoggingService.info(chatId, 'Running short-query validation', {
      conversationHistoryLength: (conversationHistory || []).length,
      lang,
      department
    });
    ChatWorkflowService.validateShortQueryOrThrow(conversationHistory, userMessage, lang, department, translationF);

    const { redactedText } = await ChatWorkflowService.processRedaction(userMessage, lang, chatId, selectedAI);
    await LoggingService.info(chatId, 'Redaction result', {
      redactedTextPreview: typeof redactedText === 'string' ? redactedText.slice(0, 400) : null
    });
    const translationData = await ChatWorkflowService.translateQuestion(redactedText, lang, selectedAI);
    await LoggingService.info(chatId, 'Translation data', { translationData });

    // Decide context to use (existing or minimal) prior to short-circuit
    // also get a cleaned conversationHistory (errors removed) so subsequent
    // steps operate on the same filtered shape
    const { context: preContext, usedExistingContext, conversationHistory: cleanedHistory } = await this.getContextForFlow({
      conversationHistory,
      translationData,
      userMessage,
      lang,
      searchProvider,
      chatId,
      selectedAI
    });
    // Log which context was chosen before short-circuit check
    await LoggingService.info(chatId, 'Pre-short-circuit context decision', {
      usedExistingContext,
      preContextPreview: preContext ? {
        translatedQuestion: preContext.translatedQuestion,
        originalLang: preContext.originalLang,
        searchProvider: preContext.searchProvider
      } : null
    });

    // run short-circuit similar-answer check using detected/original language from translation
    const detectedLang = (translationData && translationData.originalLanguage) || lang;
    const similarShortCircuit = await this.checkSimilarAnswer(chatId, userMessage, cleanedHistory, onStatusUpdate, selectedAI, lang, detectedLang);
    if (similarShortCircuit) {
      await LoggingService.info(chatId, 'Short-circuited similar-answer check succeeded:', { similarShortCircuit });

      const endTimeSC = Date.now();
      const payload = this.buildShortCircuitPayload({ similarShortCircuit, startTime, endTime: endTimeSC, translationData, userMessage, userMessageId, referringUrl, selectedAI, chatId, lang, searchProvider, contextOverride: preContext });

      // Persist payload (fire-and-forget) and short-circuit the workflow
      try {
        DataStoreService.persistInteraction(payload);
      } catch (e) {
        await LoggingService.info(chatId, 'Short-circuit persistence error (non-blocking):', { error: e && e.message });
      }

      // Return structured short-circuit result to UI using the same shape as normal flow
      await LoggingService.info(chatId, 'Short-circuit total response time:', {
        totalResponseTime: `${endTimeSC - startTime} ms`,
      });
      return {
        answer: payload.answer,
        context: payload.context,
        question: payload.question,
        citationUrl: payload.finalCitationUrl,
        confidenceRating: payload.confidenceRating,
      };
    }

    // Decide/derive context for the normal flow
    let context = preContext;
    if (!usedExistingContext) {
      context = await ContextService.deriveContext(
        selectedAI,
        translationData.translatedText,
        lang,
        department,
        referringUrl,
        searchProvider,
        cleanedHistory,
        chatId,
        translationData
      );
    }
    await LoggingService.info(chatId, 'Derived context:', { context });

    ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.GENERATING_ANSWER);

    const answer = await AnswerService.sendMessage(
      selectedAI,
      cleanedHistory,
      lang,
      context,
      referringUrl,
      chatId
    );
    await LoggingService.info(chatId, 'Answer Received:', { answer });
    let finalCitationUrl,
      confidenceRating = null;

    if (answer.answerType === 'normal') {
      ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.VERIFYING_CITATION);
      const citationResult = await ChatWorkflowService.verifyCitation(
        answer.citationUrl,
        lang,
        userMessage,
        department,
        translationF,
        chatId
      );
      finalCitationUrl = citationResult.url || citationResult.fallbackUrl;
      confidenceRating = citationResult.confidenceRating;
      await LoggingService.info(chatId, 'Citation validated:', {
        originalUrl: answer.citationUrl,
        finalCitationUrl,
        confidenceRating,
      });
    }

    if (answer.answerType && answer.answerType.includes('question')) {
      ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.NEED_CLARIFICATION);
    }

    const endTime = Date.now();
    const totalResponseTime = endTime - startTime;
    await LoggingService.info(chatId, 'Total response time:', {
      totalResponseTime: `${totalResponseTime} ms`,
    });

    DataStoreService.persistInteraction({
      selectedAI: selectedAI,
      question: userMessage,
      userMessageId: userMessageId,
      referringUrl: referringUrl,
      answer: answer,
      finalCitationUrl: finalCitationUrl,
      confidenceRating: confidenceRating,
      context: context,
      chatId: chatId,
      pageLanguage: lang,
      responseTime: totalResponseTime,
      searchProvider: searchProvider
    });

    await LoggingService.info(chatId, 'workflow complete');
    return {
      answer: answer,
      context: context,
      question: userMessage,
      citationUrl: finalCitationUrl,
      confidenceRating: confidenceRating,
    };
  }

  // Build the persistence payload for a short-circuit similar answer.
  buildShortCircuitPayload({ similarShortCircuit, startTime, endTime, translationData, userMessage, userMessageId, referringUrl, selectedAI, chatId, lang, searchProvider, contextOverride = null }) {
    const totalResponseTimeSC = endTime - startTime;

    // Build a minimal safe context object (never null)
    const scContext = contextOverride || {
      translatedQuestion: (translationData && translationData.translatedText) || userMessage,
      originalLang: (translationData && translationData.originalLanguage) || lang,
      searchProvider: searchProvider || ''
    };

    const aiCitationUrl = (similarShortCircuit.sourceCitation && similarShortCircuit.sourceCitation.aiCitationUrl)
      || similarShortCircuit.citationUrl
      || null;
    const providedCitationUrl = (similarShortCircuit.sourceCitation && similarShortCircuit.sourceCitation.providedCitationUrl)
      || similarShortCircuit.citationUrl
      || null;
    const citationHead = (similarShortCircuit.answer && similarShortCircuit.answer.citationHead)
      || (similarShortCircuit.sourceCitation && similarShortCircuit.sourceCitation.citationHead)
      || null;

    const contentText = (similarShortCircuit.answer && (similarShortCircuit.answer.content || (Array.isArray(similarShortCircuit.answer.paragraphs) ? similarShortCircuit.answer.paragraphs.join('\n\n') : ''))) || '';
    const parsedSentences = AnswerService.parseSentences(contentText || '');

    const payload = {
      selectedAI: selectedAI,
      question: userMessage,
      userMessageId: userMessageId,
      referringUrl: referringUrl,
      answer: {
        answerType: 'normal',
        content: similarShortCircuit.answer && similarShortCircuit.answer.content,
        paragraphs: (similarShortCircuit.answer && similarShortCircuit.answer.paragraphs) || [],
        sentences: parsedSentences,
        citationHead: citationHead,
        questionLanguage: (translationData && translationData.originalLanguage) || lang,
        englishQuestion: (translationData && translationData.translatedText) || userMessage,
        tools: [],
        citationUrl: aiCitationUrl
      },
      finalCitationUrl: providedCitationUrl,
      confidenceRating: similarShortCircuit.confidenceRating || similarShortCircuit.similarity || null,
      context: scContext,
      chatId: chatId,
      pageLanguage: lang,
      responseTime: totalResponseTimeSC,
      searchProvider: searchProvider
    };

    return payload;
  }

  // Determine context to use prior to short-circuit check.
  // If a suitable existing context is found from the last AI turn (non-question and non-null), return it enriched.
  // Otherwise, return a minimal context built from translation information so we can persist/use it in short-circuit.
  async getContextForFlow({ conversationHistory, translationData, userMessage, lang, searchProvider, chatId, selectedAI }) {
    // Filter history for safe inspection
    const safeHistory = (conversationHistory || []).filter(m => m && !m.error);
    // Also expose the cleaned history for callers so they can use the same
    // filtered shape for similar-answer checks and for sending to AnswerService
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
      const context = lastMessage.interaction.context;
      context.translatedQuestion = (translationData && translationData.translatedText) || userMessage;
      context.originalLang = (translationData && translationData.originalLanguage) || lang;
      context.outputLang = ContextService.determineOutputLang(lang, translationData);

      return { context, usedExistingContext: true, conversationHistory: aiHistory };
    }

    // Minimal context for short-circuit persistence/use
    const minimalContext = {
      translatedQuestion: (translationData && translationData.translatedText) || userMessage,
      originalLang: (translationData && translationData.originalLanguage) || lang,
      searchProvider: searchProvider || ''
    };
    return { context: minimalContext, usedExistingContext: false, conversationHistory: aiHistory };
  }

  // Query the chat-similar-answer endpoint and return a short-circuit
  // response object if an answer is available. Returns null to continue
  // the normal workflow when no similar answer is found or an error occurs.
  async checkSimilarAnswer(chatId, userMessage, conversationHistory, onStatusUpdate, selectedAI, pageLang = null, detectedLang = null) {
    try {
      // Build user-only sequence (oldest -> newest) including current user message.
      // Conversation history can come in a few shapes depending on the caller:
      // - UI messages: { sender: 'user', text: '...' }
      // - AI turns: { sender: 'ai', interaction: { question: '...', answer: {...} } }
      // - Older shapes: { question: '...' }
      // Normalize to an array of question strings in chronological order.
      const priorUserTurns = (conversationHistory || [])
        .filter(m => m && !m.error)
        .map(m => {
          if (m.sender === 'user' && typeof m.text === 'string' && m.text.trim()) return m.text.trim();
          if (m.interaction && typeof m.interaction.question === 'string' && m.interaction.question.trim()) return m.interaction.question.trim();
          if (typeof m.question === 'string' && m.question.trim()) return m.question.trim();
          return null;
        })
        .filter(q => q);
      const questions = [...priorUserTurns, ...(typeof userMessage === 'string' && userMessage.trim() ? [userMessage.trim()] : [])];
      const fp = await getFingerprint();
      const similarResp = await fetch(getApiUrl('chat-similar-answer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-fp-id': fp },
        body: JSON.stringify({ chatId, questions, selectedAI, pageLanguage: pageLang || null, detectedLanguage: detectedLang || null })
      });
      if (similarResp && similarResp.ok) {
        const similarJson = await similarResp.json();
        if (similarJson && similarJson.answer) {
          await LoggingService.info(chatId, 'chat-similar-answer returned, short-circuiting workflow', {
            similar: similarJson
          });
          ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.GENERATING_ANSWER);
          // Build an answer object that matches the UI's expected shape so
          // the message content is displayed. Prefer `paragraphs` (rendered
          // first), but also include `sentences` and `content` for safety.
          const answerText = similarJson.answer;
          return {
            answer: {
              answerType: 'normal',
              content: answerText,
              paragraphs: [answerText],
              sentences: [answerText],
              // expose metadata for potential UI display
              providedByInteractionId: similarJson.interactionId || null,
              similarity: similarJson.similarity || null
              ,
              citationHead: (similarJson.citation && similarJson.citation.citationHead) || null
            },
            context: null,
            question: userMessage,
            citationUrl: (similarJson.citation && (similarJson.citation.providedCitationUrl || similarJson.citation.aiCitationUrl)) || null,
            confidenceRating: similarJson.similarity || null,
            // include full citation info for persistence contract
            sourceCitation: similarJson.citation || null
          };
        }
      } else {
        await LoggingService.info(chatId, 'chat-similar-answer call failed or returned no result', {
          status: similarResp && similarResp.status
        });
      }
    } catch (err) {
      await LoggingService.info(chatId, 'chat-similar-answer error, continuing workflow', { error: err && err.message });
    }
    return null;
  }
}
