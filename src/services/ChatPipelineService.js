import ContextService from './ContextService.js';
import AnswerService from './AnswerService.js';
import DataStoreService from './DataStoreService.js';
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

// Helper function to control which status updates are actually sent to the UI
const sendStatusUpdate = (onStatusUpdate, status) => {
  // Only send status updates for the statuses we want to display
  const displayableStatuses = [
    PipelineStatus.MODERATING_QUESTION,
    PipelineStatus.SEARCHING,
    PipelineStatus.GENERATING_ANSWER,
    PipelineStatus.VERIFYING_CITATION,
    PipelineStatus.MODERATING_ANSWER,
    PipelineStatus.ERROR,
    PipelineStatus.NEED_CLARIFICATION
  ];
  
  if (displayableStatuses.includes(status)) {
    onStatusUpdate(status);
  }
};

// Helper function to count words in a string
const countWords = (text) => {
  if (!text || typeof text !== 'string') return 0;
  const words = text.trim().split(/\s+/);
  // Stop counting after 4 words for efficiency
  return Math.min(words.length, 4);
};

// Helper function to check if query is too short
const isShortQuery = (wordCount) => {
  return wordCount <= 2;
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
    
    // Send updated status (displaying "Assessing question")
    sendStatusUpdate(onStatusUpdate, PipelineStatus.MODERATING_QUESTION);

    // Check for short queries before redaction (only for first question in session)
    if (conversationHistory.length === 0) {
      const wordCount = countWords(userMessage);
      if (isShortQuery(wordCount)) {
        // Generate search URL using the same logic as redaction fallback
        const searchUrl = urlToSearch.generateFallbackSearchUrl(lang, userMessage, department, translationF);
        throw new ShortQueryValidation('Short query detected', userMessage, searchUrl.fallbackUrl);
      }
    }

    // Do redaction but don't display status
    await ChatPipelineService.processRedaction(userMessage, lang);
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
      !conversationHistory[conversationHistory.length - 1].interaction.answer.answerType.includes('question')
    ) {
      const lastMessage = conversationHistory[conversationHistory.length - 1];
      context = lastMessage.interaction.context;
    } else {
      // if initial questions or last response type was a question
      // Get context but don't display status
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

    // Send updated status (displaying "Thinking...")
    sendStatusUpdate(onStatusUpdate, PipelineStatus.GENERATING_ANSWER);

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
      // Send updated status (displaying "Testing citation link")
      sendStatusUpdate(onStatusUpdate, PipelineStatus.VERIFYING_CITATION);
      
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

    if (answer.answerType && answer.answerType.includes('question')) {
      sendStatusUpdate(onStatusUpdate, PipelineStatus.NEED_CLARIFICATION);
    }

    // Update datastore but don't display status
    const endTime = Date.now();
    const totalResponseTime = endTime - startTime;
    await LoggingService.info(chatId, 'Total response time:', {
      totalResponseTime: `${totalResponseTime} ms`,
    });

    DataStoreService.persistInteraction({
      selectedAI: selectedAI,
      question: userMessage,
      userMessageId: userMessageId,
      referringUrl:referringUrl,
      answer: answer,
      finalCitationUrl: finalCitationUrl,
      confidenceRating: confidenceRating,
      context: context,
      chatId: chatId,
      pageLanguage: lang,
      responseTime: totalResponseTime,
      searchProvider: searchProvider
    });

    // Don't display complete status
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
  processRedaction: async (userMessage, lang) => {
    // Ensure RedactionService is initialized before using it
    await RedactionService.ensureInitialized(lang);

    const { redactedText, redactedItems } = RedactionService.redactText(userMessage, lang);

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

export class ShortQueryValidation extends Error {
  constructor(message, userMessage, searchUrl) {
    super(message);
    this.name = 'ShortQueryValidation';
    this.userMessage = userMessage;
    this.searchUrl = searchUrl;
  }
}