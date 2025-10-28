import ContextService from '../services/ContextService.js';
import AnswerService from '../services/AnswerService.js';
import DataStoreService from '../services/DataStoreService.js';

import LoggingService from '../services/ClientLoggingService.js';

import { ChatWorkflowService, WorkflowStatus } from '../services/ChatWorkflowService.js';

export class DefaultAlwaysContext {
  constructor() { }

  sendStatusUpdate(onStatusUpdate, status) {
    ChatWorkflowService.sendStatusUpdate(onStatusUpdate, status);
  }

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
    searchProvider,
    overrideUserId = null
  ) {
    const startTime = Date.now();
    await LoggingService.info(chatId, 'Starting DefaultAlwaysContext with data:', {
      lang,
      referringUrl,
      selectedAI,
      startTime
    });
    ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.MODERATING_QUESTION);
    // Log that validation is about to run (avoid dumping entire history; log length instead)
    await LoggingService.info(chatId, 'Running short-query validation', {
      conversationHistoryLength: (conversationHistory || []).length,
      lang,
      department
    });
    ChatWorkflowService.validateShortQueryOrThrow(conversationHistory, userMessage, lang, department, translationF);

    const { redactedText } = await ChatWorkflowService.processRedaction(userMessage, lang, chatId, selectedAI);
    // Log redaction outcome (redactedText may be empty or same as input)
    await LoggingService.info(chatId, 'Redaction result', {
      redactedTextPreview: typeof redactedText === 'string' ? redactedText.slice(0, 400) : null
    });

    // Build translationContext (previous user messages excluding the most recent)
    const translationContext = ChatWorkflowService.buildTranslationContext(conversationHistory);

    const translationData = await ChatWorkflowService.translateQuestion(redactedText, lang, selectedAI, translationContext);
    // Log translation details for diagnostics
    await LoggingService.info(chatId, 'Translation data', { translationData });


    // Always derive a fresh context for each question (do not reuse previous AI context)
    let context = null;
    conversationHistory = conversationHistory.filter((message) => !message.error);
    conversationHistory = conversationHistory.filter((message) => message.sender === 'ai');
    
    

    context = await ContextService.deriveContext(
      selectedAI,
      translationData.translatedText,
      lang,
      department,
      referringUrl,
      searchProvider,
      conversationHistory,
      chatId,
      translationData
    );
    await LoggingService.info(chatId, 'Derived context (always recreated):', { context });
    
    this.sendStatusUpdate(onStatusUpdate, WorkflowStatus.GENERATING_ANSWER);

    const answer = await AnswerService.sendMessage(
      selectedAI,
      conversationHistory,
      lang,
      context,
      referringUrl,
      chatId,
      overrideUserId
    );
    await LoggingService.info(chatId, 'Answer Received:', { answer });
    let finalCitationUrl,
      confidenceRating = null;

    if (answer.answerType === 'normal') {
      this.sendStatusUpdate(onStatusUpdate, WorkflowStatus.VERIFYING_CITATION);
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
      this.sendStatusUpdate(onStatusUpdate, WorkflowStatus.NEED_CLARIFICATION);
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
}
