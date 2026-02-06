import DataStoreService from './DataStoreService.js';

export const WorkflowStatus = {
  REDACTING: 'redacting',
  MODERATING_QUESTION: 'moderatingQuestion',
  SEARCHING: 'searching',
  GETTING_CONTEXT: 'gettingContext',
  BUILDING_CONTEXT: 'buildingContext',
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
    WorkflowStatus.BUILDING_CONTEXT,
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
        resolvedWorkflow = await DataStoreService.getPublicSetting('workflow.default', 'DefaultGraph');
      } catch (err) {
        resolvedWorkflow = 'DefaultGraph';
      }
    }

    // Select workflow implementation based on the resolved workflow.
    // We only support Graph-based workflows now.
    // Use the single GraphClient for graph-based client workflows to avoid duplicated code.
    const { default: GraphClient } = await import('../workflows/GraphClient.js');
    let graphName;
    if (resolvedWorkflow === 'DefaultGraph') {
      graphName = 'GenericWorkflowGraph';
    } else if (resolvedWorkflow === 'InstantAndQAGraph') {
      graphName = 'InstantAndQAGraph';
    } else if (resolvedWorkflow === 'GPT5MiniDefaultGraph') {
      graphName = 'GPT5MiniDefaultGraph';
    } else if (resolvedWorkflow === 'DefaultWithVectorGraph') {
      graphName = 'DefaultWithVectorGraph';
    } else {
      // Fallback for any legacy values to DefaultWithVectorGraph
      graphName = 'DefaultWithVectorGraph';
    }

    const implInstance = new GraphClient(graphName);
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

  // Expose the status update filter helper so workflows can reuse the centralized display rules
  sendStatusUpdate: (onStatusUpdate, status) => {
    return sendStatusUpdate(onStatusUpdate, status);
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
