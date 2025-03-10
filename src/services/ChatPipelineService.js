import ContextService from './ContextService.js';
import AnswerService from './AnswerService.js';
import { DataStoreService } from './DataStoreService.js';
import { urlToSearch } from '../utils/urlToSearch.js';
import RedactionService from './RedactionService.js';
import LoggingService from './ClientLoggingService.js';

export const PipelineStatus = {
  REDACTING: 'redacting',
  MODERATING_QUESTION: 'moderatingQuestion',
  SEARCHING: 'searching',
  GETTING_CONTEXT: 'gettingContext',
  GENERATING_ANSWER: 'generatingAnswer',
  COMPLETE: 'complete',
  VERIFYING_CITATION: 'verifyingCitation',
  UPDATING_DATASTORE: 'updatingDatastore',
  MODERATING_ANSWER: 'moderatingAnswer',
  ERROR: 'error',
  NEED_CLARIFICATION: 'needClarification',
};
export const ChatPipelineService = {
  processResponse: async (
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
  ) => {
    const startTime = Date.now();
    onStatusUpdate(PipelineStatus.MODERATING_QUESTION);

    onStatusUpdate(PipelineStatus.REDACTING);
    await ChatPipelineService.processRedaction(userMessage);
    await LoggingService.info(chatId, 'Starting pipeline with data:', {
      userMessage,
      lang,
      department,
      referringUrl,
      selectedAI,
    });

    let context = null;
    // remove error messages
    conversationHistory = conversationHistory.filter((message) => !message.error);
    conversationHistory = conversationHistory.filter((message) => message.sender === 'ai');
    if (
      conversationHistory.length > 0 &&
      conversationHistory[conversationHistory.length - 1].interaction.answer.answerType !==
        'question'
    ) {
      const lastMessage = conversationHistory[conversationHistory.length - 1];
      context = lastMessage.interaction.context;
    } else {
      // if initial questions or last response type was a question
      onStatusUpdate(PipelineStatus.GETTING_CONTEXT);
      context = await ContextService.deriveContext(
        selectedAI,
        userMessage,
        lang,
        department,
        referringUrl,
        searchProvider,
        conversationHistory,
        chatId
      );
    }
    await LoggingService.info(chatId, 'Derived context:', { context });

    onStatusUpdate(PipelineStatus.GENERATING_ANSWER);

    // TOOD check about evaluation
    const answer = await AnswerService.sendMessage(
      selectedAI,
      userMessage,
      conversationHistory,
      lang,
      context,
      false,
      referringUrl,
      chatId
    );
    await LoggingService.info(chatId, 'Answer Received:', { answer });
    let finalCitationUrl,
      confidenceRating = null;

    if (answer.answerType === 'normal') {
      onStatusUpdate(PipelineStatus.VERIFYING_CITATION);
      // Use answer.citationUrl directly
      const citationResult = await ChatPipelineService.verifyCitation(
        answer.citationUrl,
        lang,
        userMessage,
        department,
        translationF
      );

      // Extract the URL correctly depending on whether it's a valid URL or a fallback
      finalCitationUrl = citationResult.url || citationResult.fallbackUrl;
      confidenceRating = citationResult.confidenceRating;
      await LoggingService.info(chatId, 'Citation validated:', {
        originalUrl: answer.citationUrl,
        finalCitationUrl,
        confidenceRating,
      });
    }

    if (answer.answerType === 'question') {
      onStatusUpdate(PipelineStatus.NEED_CLARIFICATION);
    }

    onStatusUpdate(PipelineStatus.UPDATING_DATASTORE);

    const endTime = Date.now();
    const totalResponseTime = endTime - startTime;
    await LoggingService.info(chatId, 'Total response time:', {
      totalResponseTime: `${totalResponseTime} ms`,
    });

    // Log the interaction with both the original and validated URL
    DataStoreService.persistInteraction(
      selectedAI,
      userMessage,
      userMessageId,
      referringUrl,
      answer,
      finalCitationUrl,
      confidenceRating,
      context,
      chatId,
      lang,
      totalResponseTime,
      searchProvider
    );

    onStatusUpdate(PipelineStatus.COMPLETE);
    await LoggingService.info(chatId, 'pipeline complete');
    return {
      answer: answer,
      context: context,
      question: userMessage,
      citationUrl: finalCitationUrl,
      confidenceRating: confidenceRating,
    };
  },
  verifyCitation: async (originalCitationUrl, lang, redactedText, selectedDepartment, t) => {
    const validationResult = await urlToSearch.validateAndCheckUrl(
      originalCitationUrl,
      lang,
      redactedText,
      selectedDepartment,
      t
    );
    await LoggingService.info(null, 'Validated URL:', validationResult);
    return validationResult;
  },
  processRedaction: async (userMessage) => {
    // Ensure RedactionService is initialized before using it
    await RedactionService.ensureInitialized();
    
    const { redactedText, redactedItems } = RedactionService.redactText(userMessage);

    // Check for blocked content (# for profanity/threats/manipulation, XXX for private info)
    const hasBlockedContent = redactedText.includes('#') || redactedText.includes('XXX');
    if (hasBlockedContent) {
      throw new RedactionError('Blocked content detected', redactedText, redactedItems);
    }
  },
};

export class RedactionError extends Error {
  constructor(message, redactedText, redactedItems) {
    super(message);
    this.name = 'RedactionError';
    this.redactedText = redactedText;
    this.redactedItems = redactedItems;
  }
}
