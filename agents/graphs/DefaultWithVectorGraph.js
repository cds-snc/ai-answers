import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import ServerLoggingService from '../../services/ServerLoggingService.js';
import { DefaultWithVectorServerWorkflow, RedactionError, ShortQueryValidation } from './workflows/defaultWithVectorHelpers.js';

const WorkflowStatus = {
  MODERATING_QUESTION: 'moderatingQuestion',
  GENERATING_ANSWER: 'generatingAnswer',
  VERIFYING_CITATION: 'verifyingCitation',
  NEED_CLARIFICATION: 'needClarification',
  COMPLETE: 'complete',
};

const workflow = new DefaultWithVectorServerWorkflow();

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
  confidenceRating: Annotation(),
  status: Annotation(),
  result: Annotation(),
});

const graph = new StateGraph(GraphState);

graph.addNode('init', async (state) => {
  const startTime = Date.now();
  await ServerLoggingService.info('Starting DefaultWithVectorGraph', state.chatId, {
    lang: state.lang,
    referringUrl: state.referringUrl,
    selectedAI: state.selectedAI,
  });
  return { startTime, status: WorkflowStatus.MODERATING_QUESTION };
});

graph.addNode('validate', async (state) => {
  try {
    workflow.validateShortQuery(state.conversationHistory, state.userMessage, state.lang, state.department);
    return {};
  } catch (error) {
    if (error instanceof ShortQueryValidation) {
      throw error;
    }
    throw error;
  }
});

graph.addNode('redact', async (state) => {
  try {
    const { redactedText } = await workflow.processRedaction(state.userMessage, state.lang, state.chatId, state.selectedAI);
    return { redactedText };
  } catch (error) {
    if (error instanceof RedactionError) {
      throw error;
    }
    throw error;
  }
});

graph.addNode('translate', async (state) => {
  const translationContext = workflow.buildTranslationContext(state.conversationHistory);
  const translationData = await workflow.translateQuestion(state.redactedText, state.lang, state.selectedAI, translationContext);
  return { translationData };
});

graph.addNode('contextNode', async (state) => {
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

  return {
    context,
    cleanedHistory,
    usedExistingContext,
  };
});

graph.addNode('shortCircuit', async (state) => {
  const detectedLang = state.translationData?.originalLanguage || state.lang;
  const similar = await workflow.checkSimilarAnswer({
    chatId: state.chatId,
    userMessage: state.userMessage,
    conversationHistory: state.cleanedHistory,
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
      await workflow.persistInteraction(payload);
    } catch (err) {
      await ServerLoggingService.error('Short-circuit persistence error', state.chatId, err);
    }

    return {
      status: WorkflowStatus.GENERATING_ANSWER,
      shortCircuitPayload: payload,
      confidenceRating: payload.confidenceRating,
      finalCitationUrl: payload.finalCitationUrl,
    };
  }

  return { status: WorkflowStatus.GENERATING_ANSWER };
});

graph.addNode('answerNode', async (state) => {
  const answer = await workflow.sendAnswerRequest({
    selectedAI: state.selectedAI,
    conversationHistory: state.cleanedHistory,
    lang: state.lang,
    context: state.context,
    referringUrl: state.referringUrl,
    chatId: state.chatId,
  });
  return { answer };
});

graph.addNode('verifyNode', async (state) => {
  if (state.answer && state.answer.answerType === 'normal') {
    const citationResult = await workflow.verifyCitation({
      citationUrl: state.answer.citationUrl,
      lang: state.lang,
      question: state.userMessage,
      department: state.department,
      translationF: state.translationF,
      chatId: state.chatId,
    });

    return {
      status: WorkflowStatus.VERIFYING_CITATION,
      finalCitationUrl: citationResult.url || citationResult.fallbackUrl,
      confidenceRating: citationResult.confidenceRating,
    };
  }
  return {};
});

graph.addNode('persistNode', async (state) => {
  const endTime = Date.now();
  const totalResponseTime = endTime - state.startTime;

  const isShortCircuit = Boolean(state.shortCircuitPayload);
  const answerData = isShortCircuit ? state.shortCircuitPayload.answer : state.answer;
  const contextData = isShortCircuit ? state.shortCircuitPayload.context : state.context;
  const finalCitationUrl = state.finalCitationUrl ?? state.shortCircuitPayload?.finalCitationUrl ?? null;
  const confidenceRating = state.confidenceRating ?? state.shortCircuitPayload?.confidenceRating ?? null;

  const needsClarification = Boolean(state.answer && state.answer.answerType && state.answer.answerType.includes('question'));

  if (!isShortCircuit) {
    await workflow.persistInteraction({
      selectedAI: state.selectedAI,
      question: state.userMessage,
      userMessageId: state.userMessageId,
      referringUrl: state.referringUrl,
      answer: answerData,
      finalCitationUrl,
      confidenceRating,
      context: contextData,
      chatId: state.chatId,
      pageLanguage: state.lang,
      responseTime: totalResponseTime,
      searchProvider: state.searchProvider,
    });
  }

  await ServerLoggingService.info('Workflow complete', state.chatId, { totalResponseTime });

  return {
    status: needsClarification ? WorkflowStatus.NEED_CLARIFICATION : WorkflowStatus.COMPLETE,
    result: {
      answer: answerData,
      context: contextData,
      question: state.userMessage,
      citationUrl: finalCitationUrl,
      confidenceRating,
    },
  };
});

graph.addConditionalEdges('shortCircuit', (state) =>
  state.shortCircuitPayload ? 'skipAnswer' : 'runAnswer',
  {
    skipAnswer: 'persistNode',
    runAnswer: 'answerNode',
  },
);

graph.addEdge(START, 'init');
graph.addEdge('init', 'validate');
graph.addEdge('validate', 'redact');
graph.addEdge('redact', 'translate');
graph.addEdge('translate', 'contextNode');
graph.addEdge('contextNode', 'shortCircuit');
graph.addEdge('answerNode', 'verifyNode');
graph.addEdge('verifyNode', 'persistNode');
graph.addEdge('answerNode', 'persistNode');

graph.addEdge('persistNode', END);

export const defaultWithVectorGraphApp = graph.compile();

export async function runDefaultWithVectorGraph(input) {
  return defaultWithVectorGraphApp.invoke(input);
}




