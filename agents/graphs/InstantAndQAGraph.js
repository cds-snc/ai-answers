import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import ServerLoggingService from '../../services/ServerLoggingService.js';
import { logGraphEvent } from './GraphEventLogger.js';
import { GraphWorkflowHelper, RedactionError, ShortQueryValidation } from './workflows/GraphWorkflowHelper.js';
import QuestionAnswerService from '../../services/QuestionAnswerService.js';
import { graphRequestContext } from './requestContext.js';

const WorkflowStatus = {
  MODERATING_QUESTION: 'moderatingQuestion',
  BUILDING_CONTEXT: 'buildingContext',
  GENERATING_ANSWER: 'generatingAnswer',
  VERIFYING_CITATION: 'verifyingCitation',
  NEED_CLARIFICATION: 'needClarification',
  COMPLETE: 'complete',
};

const workflow = new GraphWorkflowHelper();

const GraphState = Annotation.Root({
  chatId: Annotation(),
  userMessage: Annotation(),
  userMessageId: Annotation(),
  conversationHistory: Annotation(),
  lang: Annotation(),
  department: Annotation(),
  referringUrl: Annotation(),
  selectedAI: Annotation(),
  translationF: Annotation(),
  searchProvider: Annotation(),
  overrideUserId: Annotation(),
  startTime: Annotation(),
  redactedText: Annotation(),
  translationData: Annotation(),
  cleanedHistory: Annotation(),
  context: Annotation(),
  usedExistingContext: Annotation(),
  shortCircuitPayload: Annotation(),
  answer: Annotation(),
  finalCitationUrl: Annotation(),
  status: Annotation(),
  result: Annotation(),
});

const graph = new StateGraph(GraphState);

graph.addNode('init', async (state) => {
  const startTime = Date.now();
  logGraphEvent('info', 'node:init input', state.chatId, {
    lang: state.lang,
    referringUrl: state.referringUrl,
    selectedAI: state.selectedAI,
    userMessage: state.userMessage,
  });

  await ServerLoggingService.info('Starting InstantAndQAGraph', state.chatId, {
    lang: state.lang,
    referringUrl: state.referringUrl,
    selectedAI: state.selectedAI,
  });
  const out = { startTime, status: WorkflowStatus.MODERATING_QUESTION };
  logGraphEvent('info', 'node:init output', state.chatId, out);
  return out;
});

graph.addNode('validate', async (state) => {
  logGraphEvent('info', 'node:validate input', state.chatId, {
    userMessage: state.userMessage,
    conversationHistory: state.conversationHistory,
    lang: state.lang,
    department: state.department,
  });

  try {
    await workflow.validateShortQuery(state.conversationHistory, state.userMessage, state.lang, state.department);
    const out = {};
    logGraphEvent('info', 'node:validate output', state.chatId, out);
    return out;
  } catch (error) {
    if (error instanceof ShortQueryValidation) {
      throw error;
    }
    throw error;
  }
});

graph.addNode('redact', async (state) => {
  try {
    logGraphEvent('info', 'node:redact input', state.chatId, {
      userMessage: state.userMessage,
      lang: state.lang,
      selectedAI: state.selectedAI,
    });

    const { redactedText } = await workflow.processRedaction(state.userMessage, state.lang, state.chatId, state.selectedAI);

    const out = { redactedText };
    logGraphEvent('info', 'node:redact output', state.chatId, out);
    return out;
  } catch (error) {
    if (error instanceof RedactionError) {
      throw error;
    }
    throw error;
  }
});

graph.addNode('translate', async (state) => {
  const translationContext = workflow.buildTranslationContext(state.conversationHistory);
  logGraphEvent('info', 'node:translate input', state.chatId, {
    redactedText: state.redactedText,
    translationContext,
    selectedAI: state.selectedAI,
  });

  const translationData = await workflow.translateQuestion(state.redactedText, 'en', state.selectedAI, translationContext);

  const out = { translationData };
  logGraphEvent('info', 'node:translate output', state.chatId, out);
  return out;
});

graph.addNode('contextNode', async (state) => {
  logGraphEvent('info', 'node:context input', state.chatId, {
    conversationHistory: state.conversationHistory,
    translationData: state.translationData,
    userMessage: state.userMessage,
    lang: state.lang,
  });

  const { context: preContext, usedExistingContext, conversationHistory: cleanedHistory } = await workflow.getContextForFlow({
    conversationHistory: state.conversationHistory,
    department: state.department,
    overrideUserId: state.overrideUserId,
    translationData: state.translationData,
    userMessage: state.userMessage,
    lang: state.lang,
    searchProvider: state.searchProvider,
    chatId: state.chatId,
    selectedAI: state.selectedAI,
  });

  let context = preContext;
  if (!usedExistingContext) {
    context = await workflow.deriveContext({
      selectedAI: state.selectedAI,
      translationData: state.translationData,
      lang: state.lang,
      department: state.department,
      referringUrl: state.referringUrl,
      searchProvider: state.searchProvider,
      conversationHistory: cleanedHistory,
      overrideUserId: state.overrideUserId,
      chatId: state.chatId,
      userMessage: state.userMessage,
    });
  }

  const out = {
    context,
    cleanedHistory,
    usedExistingContext,
    status: WorkflowStatus.GENERATING_ANSWER,
  };
  logGraphEvent('info', 'node:context output', state.chatId, out);
  return out;
});

graph.addNode('similarQuestions', async (state) => {
  logGraphEvent('info', 'node:similarQuestions input', state.chatId, {
    userMessage: state.userMessage,
    lang: state.lang,
  });

  let similarQuestions = '';
  try {
    similarQuestions = await QuestionAnswerService.getSimilarQuestionsContext(state.userMessage, {
      k: 3,
      threshold: 0.8,
      expertFeedbackRating: 100,
      expertFeedbackComparison: 'lt',
      language: state.lang,
      includeQuestionFlow: true,
      provider: state.selectedAI,
    });
  } catch (err) {
    await ServerLoggingService.warn('similarQuestions node failed', state.chatId, err);
  }

  const out = {
    context: { ...state.context, similarQuestions },
  };
  logGraphEvent('info', 'node:similarQuestions output', state.chatId, { hasSimilar: !!similarQuestions });
  return out;
});
graph.addNode('shortCircuit', async (state) => {
  // Emit input log for shortCircuit node
  logGraphEvent('info', 'node:shortCircuit input', state.chatId, {
    userMessage: state.userMessage,
    translationData: state.translationData,
    lang: state.lang,
  });

  const detectedLang = state.translationData?.originalLanguage || state.lang;

  // Determine whether there is any prior AI reply in the original conversation history.
  // If there is an AI reply, skip the similar-answer short-circuit and proceed to context derivation.
  const cleanedHistory = (state.conversationHistory || []).filter(m => m && !m.error);
  const hasAIReply = cleanedHistory.some(m => m.sender === 'ai' || (m.interaction && m.interaction.answer));

  if (hasAIReply) {
    logGraphEvent('info', 'skipping shortCircuit similar-answer because prior AI reply exists in original conversation history', state.chatId, {
      hasAIReply,
    });
    const out = { cleanedHistory, status: WorkflowStatus.BUILDING_CONTEXT };
    logGraphEvent('info', 'node:shortCircuit output', state.chatId, { shortCircuit: false, skipped: true });
    return out;
  }

  const similar = await workflow.checkSimilarAnswer({
    chatId: state.chatId,
    userMessage: state.userMessage,
    conversationHistory: cleanedHistory,
    selectedAI: state.selectedAI,
    lang: state.lang,
    detectedLang,
    searchProvider: state.searchProvider,
  });

  if (similar) {
    const payload = workflow.buildShortCircuitPayload({
      similarShortCircuit: similar,
      startTime: state.startTime,
      endTime: Date.now(),
      translationData: state.translationData,
      userMessage: state.userMessage,
      userMessageId: state.userMessageId,
      referringUrl: state.referringUrl,
      selectedAI: state.selectedAI,
      chatId: state.chatId,
      lang: state.lang,
      searchProvider: state.searchProvider,
      contextOverride: state.context,
    });

    try {
      const ctx = graphRequestContext.getStore();
      const user = ctx?.user;
      await workflow.persistInteraction({ ...payload, workflow: 'InstantAndQAGraph' }, user);
    } catch (err) {
      await ServerLoggingService.error('Short-circuit persistence error', state.chatId, err);
    }

    const out = {
      status: WorkflowStatus.GENERATING_ANSWER,
      shortCircuitPayload: payload,
      finalCitationUrl: payload.finalCitationUrl,
    };
    // Emit output log for shortCircuit node
    logGraphEvent('info', 'node:shortCircuit output', state.chatId, { shortCircuit: true, payload: out });
    return out;
  }

  const out = { cleanedHistory, status: WorkflowStatus.BUILDING_CONTEXT };
  // Emit output log for shortCircuit node when no short circuit detected
  logGraphEvent('info', 'node:shortCircuit output', state.chatId, { shortCircuit: false });
  return out;
});

graph.addNode('answerNode', async (state) => {
  logGraphEvent('info', 'node:answer input', state.chatId, {
    selectedAI: state.selectedAI,
    contextSummary: state.context?.summary || null,
    hasSimilar: Boolean(state.context?.similarQuestions),
  });

  const answer = await workflow.sendAnswerRequest({
    selectedAI: state.selectedAI,
    conversationHistory: state.cleanedHistory,
    lang: state.lang,
    context: state.context,
    referringUrl: state.referringUrl,
    chatId: state.chatId,
  });

  const out = { answer, status: WorkflowStatus.VERIFYING_CITATION };
  logGraphEvent('info', 'node:answer output', state.chatId, { answerType: answer?.answerType || null });
  return out;
});

graph.addNode('verifyNode', async (state) => {
  let finalCitationUrl = null;

  logGraphEvent('info', 'node:verify input', state.chatId, {
    answer: state.answer,
    shortCircuit: Boolean(state.shortCircuitPayload),
  });

  if (state.answer && state.answer.answerType === 'normal') {
    const citationResult = await workflow.verifyCitation({
      citationUrl: state.answer.citationUrl,
      lang: state.lang,
      question: state.userMessage,
      department: state.department,
      translationF: state.translationF,
      chatId: state.chatId,
      tools: state.answer?.tools || [],
    });

    finalCitationUrl = citationResult.url || citationResult.fallbackUrl;
  }

  const isShortCircuit = Boolean(state.shortCircuitPayload);
  const answerData = isShortCircuit ? state.shortCircuitPayload.answer : state.answer;
  const contextData = isShortCircuit ? state.shortCircuitPayload.context : state.context;
  const needsClarification = Boolean(state.answer && state.answer.answerType && state.answer.answerType.includes('question'));
  const out = {
    status: WorkflowStatus.VERIFYING_CITATION,
    finalCitationUrl: finalCitationUrl ?? state.finalCitationUrl,
    result: {
      answer: answerData,
      context: contextData,
      question: state.userMessage,
      citationUrl: finalCitationUrl ?? state.finalCitationUrl ?? state.shortCircuitPayload?.finalCitationUrl ?? null,
      historySignature: answerData?.historySignature ?? null,
    },
  };
  logGraphEvent('info', 'node:verify output', state.chatId, {
    finalCitationUrl: out.finalCitationUrl,
  });
  return out;
});

graph.addNode('persistNode', async (state) => {
  const endTime = Date.now();
  const totalResponseTime = endTime - state.startTime;

  const isShortCircuit = Boolean(state.shortCircuitPayload);

  logGraphEvent('info', 'node:persist input', state.chatId, {
    isShortCircuit,
    totalResponseTime,
  });

  if (!isShortCircuit) {
    const answerData = state.answer;
    const contextData = state.context;
    const finalCitationUrl = state.finalCitationUrl ?? null;

    const ctx = graphRequestContext.getStore();
    const user = ctx?.user;
    await workflow.persistInteraction({
      selectedAI: state.selectedAI,
      question: state.userMessage,
      userMessageId: state.userMessageId,
      referringUrl: state.referringUrl,
      answer: answerData,
      finalCitationUrl,
      context: contextData,
      chatId: state.chatId,
      workflow: 'InstantAndQAGraph',
      pageLanguage: state.lang,
      responseTime: totalResponseTime,
      searchProvider: state.searchProvider,
    }, user);
  }

  await ServerLoggingService.info('Workflow complete', state.chatId, { totalResponseTime });

  const needsClarification = Boolean(state.answer && state.answer.answerType && state.answer.answerType.includes('question'));

  const out = {
    status: needsClarification ? WorkflowStatus.NEED_CLARIFICATION : WorkflowStatus.COMPLETE,
  };
  logGraphEvent('info', 'node:persist output', state.chatId, out);
  return out;
});

graph.addConditionalEdges('shortCircuit', (state) =>
  state.shortCircuitPayload ? 'skipAnswer' : 'runAnswer',
  {
    skipAnswer: 'verifyNode',
    runAnswer: 'contextNode',
  },
);

graph.addEdge(START, 'init');
graph.addEdge('init', 'validate');
graph.addEdge('validate', 'redact');
graph.addEdge('redact', 'translate');
graph.addEdge('translate', 'shortCircuit');
graph.addEdge('contextNode', 'similarQuestions');
graph.addEdge('similarQuestions', 'answerNode');
graph.addEdge('answerNode', 'verifyNode');
graph.addEdge('verifyNode', 'persistNode');
graph.addEdge('persistNode', END);

export const instantAndQAGraphApp = graph.compile();

export async function runInstantAndQAGraph(input) {
  return instantAndQAGraphApp.invoke(input);
}
