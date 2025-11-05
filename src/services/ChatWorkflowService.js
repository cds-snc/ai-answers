import { urlToSearch } from '../utils/urlToSearch.js';
import { getApiUrl } from '../utils/apiToUrl.js';
import RedactionService from './RedactionService.js';
import LoggingService from './ClientLoggingService.js';
import { getFingerprint } from '../utils/fingerprint.js';
import getSessionBypassHeaders from './sessionHeaders.js';
import DataStoreService from './DataStoreService.js';

export const WorkflowStatus = {
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
    WorkflowStatus.MODERATING_QUESTION,
    WorkflowStatus.SEARCHING,
    WorkflowStatus.GENERATING_ANSWER,
    WorkflowStatus.VERIFYING_CITATION,
    WorkflowStatus.MODERATING_ANSWER,
    WorkflowStatus.ERROR,
    WorkflowStatus.NEED_CLARIFICATION
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

// Returns true if any previous user message in the conversation history has more than 2 words
const hasAnyLongUserMessage = (conversationHistory) => {
  return conversationHistory.some(m => m.sender === 'user' && !m.error && countWords(m.text) > 2);
};

// Throws ShortQueryValidation if the current user message is too short and no previous user message is long enough
const validateShortQueryOrThrow = (conversationHistory, userMessage, lang, department, translationF) => {
  const wordCount = countWords(userMessage);
  if (!hasAnyLongUserMessage(conversationHistory) && isShortQuery(wordCount)) {
    // Generate search URL using the same logic as redaction fallback
    const searchUrl = urlToSearch.generateFallbackSearchUrl(lang, userMessage, department, translationF);
    throw new ShortQueryValidation('Short query detected', userMessage, searchUrl.fallbackUrl);
  }
};

export const ChatWorkflowService = {
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
    workflow,
    onStatusUpdate,
    searchProvider,
    overrideUserId = null
  ) => {
    // If caller didn't provide a workflow (null/undefined/empty), load the
    // public default workflow setting so clients that haven't selected a
    // personal preference will follow the global default.
    let resolvedWorkflow = workflow;
    if (!resolvedWorkflow) {
      try {
        resolvedWorkflow = await DataStoreService.getPublicSetting('workflow.default', 'Default');
      } catch (err) {
        resolvedWorkflow = 'Default';
      }
    }

    // Select workflow implementation based on the resolved workflow.
    // Default to DefaultWorkflow when unknown.
    let mod;
    if (resolvedWorkflow === 'DefaultWithVector') {
      mod = await import('../workflows/DefaultWithVector.js');
    } else if (resolvedWorkflow === 'DefaultWithVectorGraph') {
      mod = await import('../workflows/DefaultWithVectorGraph.js');
    } else if (resolvedWorkflow === 'DefaultAlwaysContext') {
      mod = await import('../workflows/DefaultAlwaysContext.js');
    } else {
      mod = await import('../workflows/DefaultWorkflow.js');
    }
    const Impl = mod.DefaultWithVector || mod.DefaultWorkflow || mod.DefaultAlwaysContext || mod.default;
    const implInstance = new Impl();
    return implInstance.processResponse(
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
      overrideUserId
    );
  },

  checkPIIOnNoContextOrThrow: async (chatId, userMessage, selectedAI) => {
    try {
      // ensure fingerprint is available before sending header
      const fp = await getFingerprint();
      const extraHeaders = getSessionBypassHeaders();
      const url = getApiUrl('chat-pii-check');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-fp-id': fp,
          ...extraHeaders
        },
        body: JSON.stringify({
          message: userMessage,
          chatId,
          agentType: selectedAI,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        await LoggingService.error(
          chatId,
          'PII check API error response:',
          { errorText }
        );
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const pii = result && Object.prototype.hasOwnProperty.call(result, 'pii') ? result.pii : null;

      if (result.blocked) {
        await LoggingService.info(chatId, 'ChatWorkflowService Blocked content detected, throwing RedactionError');
        throw new RedactionError('Blocked content detected in user message', "#############", null);
      } else if (pii !== null) {
        await LoggingService.info(chatId, 'ChatWorkflowService PII detected, redacting...');
        throw new RedactionError('PII detected in user message', pii, null);
      }
    } catch (error) {
      await LoggingService.error(chatId, 'Error during PII check (no-context path):', error);
      throw error;
    }
  },
  verifyCitation: async (originalCitationUrl, lang, redactedText, selectedDepartment, t, chatId = null) => {
    const validationResult = await urlToSearch.validateAndCheckUrl(
      originalCitationUrl,
      lang,
      redactedText,
      selectedDepartment,
      t,
      chatId
    );
    await LoggingService.info(chatId, 'Validated URL:', validationResult);
    return validationResult;
  },
  processRedaction: async (userMessage, lang, chatId = 'system', selectedAI = 'openai') => {
    // Ensure RedactionService is initialized before using it
    await RedactionService.ensureInitialized(lang);

    const { redactedText, redactedItems } = RedactionService.redactText(userMessage, lang);

    // Check for blocked content (# for profanity/threats/manipulation, XXX for private info)
    const hasBlockedContent = redactedText.includes('#') || redactedText.includes('XXX');
    if (hasBlockedContent) {
      throw new RedactionError('Blocked content detected', redactedText, redactedItems);
    }
    // Run the PII agent check and throw if it detects PII or blocked content.
    // Use the existing helper which calls the chat-pii-check API and throws RedactionError on issues.
    await ChatWorkflowService.checkPIIOnNoContextOrThrow(chatId, userMessage, selectedAI);
    // Return the redacted text and items so callers can use the redacted string
    return { redactedText, redactedItems };
  },
  // Expose the short-query validation helper so workflows can reuse the centralized logic
  validateShortQueryOrThrow: (conversationHistory, userMessage, lang, department, translationF) => {
    return validateShortQueryOrThrow(conversationHistory, userMessage, lang, department, translationF);
  },
  // Build translation context: array of previous user messages (strings), excluding the most recent user message
  buildTranslationContext: (conversationHistory = []) => {
    if (!Array.isArray(conversationHistory)) return [];
    const prevUserMessages = conversationHistory
      .filter(m => m && m.sender === 'user' && !m.error && typeof m.text === 'string')
      .map(m => m.text || '');
    // Exclude the most recent user message (last in order)
    return prevUserMessages.slice(0, -1);
  },
  // Expose the status update filter helper so workflows can reuse the centralized display rules
  sendStatusUpdate: (onStatusUpdate, status) => {
    return sendStatusUpdate(onStatusUpdate, status);
  },
  translateQuestion: async (text, desiredLanguage, selectedAI, translationContext = []) => {
    try {
      // ensure fingerprint is available before sending header
      const fp = await getFingerprint();
      const extraHeaders = getSessionBypassHeaders();
      const url = getApiUrl('chat-translate');
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-fp-id': fp,
          ...extraHeaders
        },
        body: JSON.stringify({ text, desired_language: desiredLanguage, selectedAI, translation_context: translationContext })
      });
      if (!resp || !resp.ok) {
        const errText = resp ? await resp.text() : 'no response';
        await LoggingService.error(null, 'translateQuestion API error', { status: resp && resp.status, errText });
        throw new Error(`translateQuestion API error: status=${resp && resp.status} message=${errText}`);
      }
      const json = await resp.json();
      // The API endpoint now returns a normalized shape including originalText
      return json;
    } catch (err) {
      await LoggingService.error(null, 'translateQuestion error', err);
      throw err;
    }
  }
};

export default ChatWorkflowService;

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
