import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import ServerLoggingService from '../../services/ServerLoggingService.js';
import { logGraphEvent } from './GraphEventLogger.js';
import { GraphWorkflowHelper } from './workflows/GraphWorkflowHelper.js';

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
  });

  await ServerLoggingService.info('Starting DefaultGraph', state.chatId, {
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
    throw error;
  }
});

graph.addNode('redact', async (state) => {
  try {
    logGraphEvent('info', 'node:redact input', state.chatId, {
      lang: state.lang,
      selectedAI: state.selectedAI,
    });

    const { redactedText } = await workflow.processRedaction(state.userMessage, state.lang, state.chatId, state.selectedAI);

    const out = { redactedText };
    logGraphEvent('info', 'node:redact output', state.chatId, out);
    return out;
  } catch (error) {
    throw error;
  }
});

graph.addNode('translate', async (state) => {
  const translationContext = workflow.buildTranslationContext ? workflow.buildTranslationContext(state.conversationHistory) : null;
  logGraphEvent('info', 'node:translate input', state.chatId, {
    redactedText: state.redactedText,
    translationContext,
    selectedAI: state.selectedAI,
  });

  const translationData = await workflow.translateQuestion(state.redactedText, 'en', state.selectedAI, translationContext);

  const out = { translationData, status: WorkflowStatus.BUILDING_CONTEXT };
  logGraphEvent('info', 'node:translate output', state.chatId, out);
  return out;
});

graph.addNode('contextNode', async (state) => {
  logGraphEvent('info', 'node:context input', state.chatId, {
    conversationHistory: state.conversationHistory,
    translationData: state.translationData,
    lang: state.lang,
  });

  const cleanedHistory = (state.conversationHistory || []).filter(m => m && !m.error);

  const context = await workflow.deriveContext({
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

  const out = {
    context,
    cleanedHistory,
    usedExistingContext: false,
    status: WorkflowStatus.GENERATING_ANSWER,
  };
  logGraphEvent('info', 'node:context output', state.chatId, out);
  return out;
});


graph.addNode('answerNode', async (state) => {
  logGraphEvent('info', 'node:answer input', state.chatId, {
    selectedAI: state.selectedAI,
    contextSummary: state.context?.summary || null,
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
  });

  if (state.answer && state.answer.answerType === 'normal') {
    const citationResult = await workflow.verifyCitation({
      citationUrl: state.answer.citationUrl,
      lang: state.lang,
      question: state.userMessage,
      department: state.department,
      translationF: state.translationF,
      chatId: state.chatId,
    });

    finalCitationUrl = citationResult.url || citationResult.fallbackUrl;
  }

  const needsClarification = Boolean(state.answer && state.answer.answerType && state.answer.answerType.includes('question'));
  const out = {
    status: WorkflowStatus.VERIFYING_CITATION,
    finalCitationUrl: finalCitationUrl ?? state.finalCitationUrl,
    result: {
      answer: state.answer,
      context: state.context,
      question: state.userMessage,
      citationUrl: finalCitationUrl ?? state.finalCitationUrl ?? null,
      historySignature: state.answer?.historySignature ?? null,
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

  logGraphEvent('info', 'node:persist input', state.chatId, {
    totalResponseTime,
  });

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
    workflow: 'DefaultGraph',
    pageLanguage: state.lang,
    responseTime: totalResponseTime,
    searchProvider: state.searchProvider,
  }, user);

  await ServerLoggingService.info('Workflow complete', state.chatId, { totalResponseTime });

  const needsClarification = Boolean(state.answer && state.answer.answerType && state.answer.answerType.includes('question'));

  const out = {
    status: needsClarification ? WorkflowStatus.NEED_CLARIFICATION : WorkflowStatus.COMPLETE,
  };
  logGraphEvent('info', 'node:persist output', state.chatId, out);
  return out;
});

graph.addEdge(START, 'init');
graph.addEdge('init', 'validate');
graph.addEdge('validate', 'redact');
graph.addEdge('redact', 'translate');
graph.addEdge('translate', 'contextNode');
graph.addEdge('contextNode', 'answerNode');
graph.addEdge('answerNode', 'verifyNode');
graph.addEdge('verifyNode', 'persistNode');
graph.addEdge('persistNode', END);

export const defaultGraphApp = graph.compile();

export async function runDefaultGraph(input) {
  return defaultGraphApp.invoke(input);
}

export default defaultGraphApp;
