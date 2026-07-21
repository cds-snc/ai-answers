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
  chatId: Annotation(), userMessage: Annotation(), userMessageId: Annotation(), conversationHistory: Annotation(),
  lang: Annotation(), department: Annotation(), referringUrl: Annotation(), selectedAI: Annotation(),
  translationF: Annotation(), searchProvider: Annotation(), overrideUserId: Annotation(), startTime: Annotation(),
  redactedText: Annotation(), translationData: Annotation(), cleanedHistory: Annotation(), context: Annotation(),
  usedExistingContext: Annotation(), shortCircuitPayload: Annotation(), shortCircuitDebugPayload: Annotation(), answer: Annotation(),
  finalCitationUrl: Annotation(), status: Annotation(), result: Annotation(),
});
const graph = new StateGraph(GraphState);

graph.addNode('init', async (state) => {
  const startTime = Date.now();
  await ServerLoggingService.info('Starting DefaultWithLocalModel', state.chatId, { lang: state.lang, referringUrl: state.referringUrl, selectedAI: state.selectedAI });
  logGraphEvent('info', 'node:init input', state.chatId, { lang: state.lang, referringUrl: state.referringUrl, selectedAI: state.selectedAI });
  const out = { startTime, status: WorkflowStatus.MODERATING_QUESTION };
  logGraphEvent('info', 'node:init output', state.chatId, out);
  return out;
});
graph.addNode('validate', async (state) => {
  logGraphEvent('info', 'node:validate input', state.chatId, { conversationHistory: state.conversationHistory, lang: state.lang, department: state.department });
  await workflow.validateShortQuery(state.conversationHistory, state.userMessage, state.lang, state.department);
  logGraphEvent('info', 'node:validate output', state.chatId, {});
  return {};
});
graph.addNode('redact', async (state) => {
  logGraphEvent('info', 'node:redact input', state.chatId, { lang: state.lang, selectedAI: state.selectedAI });
  const { redactedText } = await workflow.processRedaction(state.userMessage, state.lang, state.chatId, state.selectedAI);
  const out = { redactedText };
  logGraphEvent('info', 'node:redact output', state.chatId, out);
  return out;
});
graph.addNode('translate', async (state) => {
  const translationContext = workflow.buildTranslationContext(state.conversationHistory);
  logGraphEvent('info', 'node:translate input', state.chatId, { redactedText: state.redactedText, translationContext, selectedAI: state.selectedAI });
  const translationData = await workflow.translateQuestion(state.redactedText, 'en', state.selectedAI, translationContext);
  await workflow.postTranslateGuard(translationData, state.chatId, state.selectedAI);
  const out = { translationData, status: WorkflowStatus.BUILDING_CONTEXT };
  logGraphEvent('info', 'node:translate output', state.chatId, out);
  return out;
});

graph.addNode('shortCircuit', async (state) => {
  const cleanedHistory = (state.conversationHistory || []).filter(message => message && !message.error);
  logGraphEvent('info', 'node:shortCircuit input', state.chatId, { userMessage: state.userMessage, historyCount: cleanedHistory.length, language: state.lang });
  if (cleanedHistory.length > 0) {
    const out = { cleanedHistory, status: WorkflowStatus.BUILDING_CONTEXT };
    logGraphEvent('info', 'node:shortCircuit output', state.chatId, { shortCircuit: false, skipped: true, reason: 'conversation-history-present' });
    return out;
  }
  const similar = await workflow.checkSimilarAnswer({
    chatId: state.chatId, userMessage: state.userMessage, conversationHistory: [], selectedAI: state.selectedAI,
    lang: state.lang, detectedLang: state.translationData?.originalLanguage || state.lang, searchProvider: state.searchProvider,
  });
  if (!similar?.answer) {
    const out = {
      cleanedHistory,
      shortCircuitDebugPayload: similar?.debugPayload || null,
      status: WorkflowStatus.BUILDING_CONTEXT,
    };
    logGraphEvent('info', 'node:shortCircuit output', state.chatId, {
      shortCircuit: false,
      reason: similar?.debugPayload?.reason || 'no-confirmed-match',
      payload: similar?.debugPayload || null,
    });
    return out;
  }


  const payload = workflow.buildShortCircuitPayload({
    similarShortCircuit: similar, startTime: state.startTime, endTime: Date.now(), translationData: state.translationData,
    userMessage: state.userMessage, userMessageId: state.userMessageId, referringUrl: state.referringUrl,
    selectedAI: state.selectedAI, chatId: state.chatId, lang: state.lang, searchProvider: state.searchProvider,
  });
  try {
    await workflow.persistInteraction({ ...payload, workflow: 'DefaultWithLocalModel' }, graphRequestContext.getStore()?.user);
  } catch (error) {
    await ServerLoggingService.error('Local-model short-circuit persistence error', state.chatId, error);
  }
  const out = { shortCircuitPayload: payload, finalCitationUrl: payload.finalCitationUrl, status: WorkflowStatus.GENERATING_ANSWER };
  logGraphEvent('info', 'node:shortCircuit output', state.chatId, {
    shortCircuit: true,
    answer: payload.answer,
    question: payload.question,
    sourceChatId: payload.instantAnswerChatId,
    sourceInteractionId: payload.instantAnswerInteractionId,
    vectorMatches: payload.vectorMatches,
    nlpCandidates: payload.nlpCandidates,
    llmSelection: payload.llmSelection,
    historySignature: payload.historySignature,
    payload,
  });
  return out;
});

graph.addNode('contextNode', async (state) => {
  logGraphEvent('info', 'node:context input', state.chatId, { conversationHistory: state.conversationHistory, translationData: state.translationData, lang: state.lang });
  const cleanedHistory = (state.conversationHistory || []).filter(message => message && !message.error);
  const context = await workflow.deriveContext({
    selectedAI: state.selectedAI, translationData: state.translationData, lang: state.lang, department: state.department,
    referringUrl: state.referringUrl, searchProvider: state.searchProvider, conversationHistory: cleanedHistory,
    overrideUserId: state.overrideUserId, chatId: state.chatId, userMessage: state.userMessage,
  });
  const out = { context, cleanedHistory, usedExistingContext: false, status: WorkflowStatus.GENERATING_ANSWER };
  logGraphEvent('info', 'node:context output', state.chatId, out);
  return out;
});
graph.addNode('answerNode', async (state) => {
  logGraphEvent('info', 'node:answer input', state.chatId, { selectedAI: state.selectedAI, contextTopic: state.context?.topic || null, contextDepartment: state.context?.department || null, searchResultsCount: state.context?.searchResults?.length || 0 });
  const answer = await workflow.sendAnswerRequest({ selectedAI: state.selectedAI, conversationHistory: state.cleanedHistory, lang: state.lang, context: state.context, referringUrl: state.referringUrl, chatId: state.chatId });
  const out = { answer, status: WorkflowStatus.VERIFYING_CITATION };
  logGraphEvent('info', 'node:answer output', state.chatId, { answerType: answer?.answerType || null });
  return out;
});
graph.addNode('verifyNode', async (state) => {
  const shortCircuit = Boolean(state.shortCircuitPayload);
  const answer = shortCircuit ? state.shortCircuitPayload.answer : state.answer;
  const context = shortCircuit ? state.shortCircuitPayload.context : state.context;
  let finalCitationUrl = state.finalCitationUrl || null;
  if (!shortCircuit && answer?.answerType === 'normal') {
    const citation = await workflow.verifyCitation({ citationUrl: answer.citationUrl, lang: state.lang, question: state.userMessage, department: state.department, translationF: state.translationF, chatId: state.chatId });
    finalCitationUrl = citation.url || citation.fallbackUrl;
  }
  logGraphEvent('info', 'node:verify input', state.chatId, { answer, shortCircuit });
  const out = { finalCitationUrl, result: { answer, context, question: state.userMessage, citationUrl: finalCitationUrl, historySignature: answer?.historySignature || null } };
  logGraphEvent('info', 'node:verify output', state.chatId, { finalCitationUrl, shortCircuit });
  return out;
});
graph.addNode('persistNode', async (state) => {
  const totalResponseTime = Date.now() - state.startTime;
  logGraphEvent('info', 'node:persist input', state.chatId, { shortCircuit: Boolean(state.shortCircuitPayload), totalResponseTime });
  if (!state.shortCircuitPayload) {
    await workflow.persistInteraction({
      selectedAI: state.selectedAI, question: state.userMessage, userMessageId: state.userMessageId, referringUrl: state.referringUrl,
      answer: state.answer, finalCitationUrl: state.finalCitationUrl || null, context: state.context, chatId: state.chatId,
      workflow: 'DefaultWithLocalModel', pageLanguage: state.lang, responseTime: totalResponseTime, searchProvider: state.searchProvider,
    }, graphRequestContext.getStore()?.user);
  }
  const answer = state.shortCircuitPayload?.answer || state.answer;
  await ServerLoggingService.info('Workflow complete', state.chatId, { totalResponseTime });
  const out = { status: answer?.answerType?.includes('question') ? WorkflowStatus.NEED_CLARIFICATION : WorkflowStatus.COMPLETE };
  logGraphEvent('info', 'node:persist output', state.chatId, out);
  return out;
});

graph.addConditionalEdges('shortCircuit', state => state.shortCircuitPayload ? 'reuse' : 'generate', { reuse: 'verifyNode', generate: 'contextNode' });
graph.addEdge(START, 'init'); graph.addEdge('init', 'validate'); graph.addEdge('validate', 'redact'); graph.addEdge('redact', 'translate');
graph.addEdge('translate', 'shortCircuit'); graph.addEdge('contextNode', 'answerNode'); graph.addEdge('answerNode', 'verifyNode');
graph.addEdge('verifyNode', 'persistNode'); graph.addEdge('persistNode', END);

export const defaultWithLocalModelApp = graph.compile();
export async function runDefaultWithLocalModel(input) { return defaultWithLocalModelApp.invoke(input); }
export default defaultWithLocalModelApp;
