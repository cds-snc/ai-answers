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
  usedExistingContext: Annotation(), shortCircuitPayload: Annotation(), answer: Annotation(),
  finalCitationUrl: Annotation(), status: Annotation(), result: Annotation(),
});
const graph = new StateGraph(GraphState);

graph.addNode('init', async (state) => {
  const startTime = Date.now();
  await ServerLoggingService.info('Starting DefaultWithLocalModel', state.chatId, { lang: state.lang, referringUrl: state.referringUrl, selectedAI: state.selectedAI });
  const out = { startTime, status: WorkflowStatus.MODERATING_QUESTION };
  logGraphEvent('info', 'node:init output', state.chatId, out);
  return out;
});
graph.addNode('validate', async (state) => {
  await workflow.validateShortQuery(state.conversationHistory, state.userMessage, state.lang, state.department);
  return {};
});
graph.addNode('redact', async (state) => {
  const { redactedText } = await workflow.processRedaction(state.userMessage, state.lang, state.chatId, state.selectedAI);
  return { redactedText };
});
graph.addNode('translate', async (state) => {
  const translationContext = workflow.buildTranslationContext(state.conversationHistory);
  const translationData = await workflow.translateQuestion(state.redactedText, 'en', state.selectedAI, translationContext);
  await workflow.postTranslateGuard(translationData, state.chatId, state.selectedAI);
  return { translationData, status: WorkflowStatus.BUILDING_CONTEXT };
});

graph.addNode('shortCircuit', async (state) => {
  const cleanedHistory = (state.conversationHistory || []).filter(message => message && !message.error);
  if (cleanedHistory.length > 0) {
    return { cleanedHistory, status: WorkflowStatus.BUILDING_CONTEXT };
  }
  const similar = await workflow.checkSimilarAnswer({
    chatId: state.chatId, userMessage: state.userMessage, conversationHistory: [], selectedAI: state.selectedAI,
    lang: state.lang, detectedLang: state.translationData?.originalLanguage || state.lang, searchProvider: state.searchProvider,
  });
  if (!similar) return { cleanedHistory, status: WorkflowStatus.BUILDING_CONTEXT };

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
  return { shortCircuitPayload: payload, finalCitationUrl: payload.finalCitationUrl, status: WorkflowStatus.GENERATING_ANSWER };
});

graph.addNode('contextNode', async (state) => {
  const cleanedHistory = (state.conversationHistory || []).filter(message => message && !message.error);
  const context = await workflow.deriveContext({
    selectedAI: state.selectedAI, translationData: state.translationData, lang: state.lang, department: state.department,
    referringUrl: state.referringUrl, searchProvider: state.searchProvider, conversationHistory: cleanedHistory,
    overrideUserId: state.overrideUserId, chatId: state.chatId, userMessage: state.userMessage,
  });
  return { context, cleanedHistory, usedExistingContext: false, status: WorkflowStatus.GENERATING_ANSWER };
});
graph.addNode('answerNode', async (state) => ({
  answer: await workflow.sendAnswerRequest({ selectedAI: state.selectedAI, conversationHistory: state.cleanedHistory, lang: state.lang, context: state.context, referringUrl: state.referringUrl, chatId: state.chatId }),
  status: WorkflowStatus.VERIFYING_CITATION,
}));
graph.addNode('verifyNode', async (state) => {
  const shortCircuit = Boolean(state.shortCircuitPayload);
  const answer = shortCircuit ? state.shortCircuitPayload.answer : state.answer;
  const context = shortCircuit ? state.shortCircuitPayload.context : state.context;
  let finalCitationUrl = state.finalCitationUrl || null;
  if (!shortCircuit && answer?.answerType === 'normal') {
    const citation = await workflow.verifyCitation({ citationUrl: answer.citationUrl, lang: state.lang, question: state.userMessage, department: state.department, translationF: state.translationF, chatId: state.chatId });
    finalCitationUrl = citation.url || citation.fallbackUrl;
  }
  return { finalCitationUrl, result: { answer, context, question: state.userMessage, citationUrl: finalCitationUrl, historySignature: answer?.historySignature || null } };
});
graph.addNode('persistNode', async (state) => {
  if (!state.shortCircuitPayload) {
    await workflow.persistInteraction({
      selectedAI: state.selectedAI, question: state.userMessage, userMessageId: state.userMessageId, referringUrl: state.referringUrl,
      answer: state.answer, finalCitationUrl: state.finalCitationUrl || null, context: state.context, chatId: state.chatId,
      workflow: 'DefaultWithLocalModel', pageLanguage: state.lang, responseTime: Date.now() - state.startTime, searchProvider: state.searchProvider,
    }, graphRequestContext.getStore()?.user);
  }
  const answer = state.shortCircuitPayload?.answer || state.answer;
  return { status: answer?.answerType?.includes('question') ? WorkflowStatus.NEED_CLARIFICATION : WorkflowStatus.COMPLETE };
});

graph.addConditionalEdges('shortCircuit', state => state.shortCircuitPayload ? 'reuse' : 'generate', { reuse: 'verifyNode', generate: 'contextNode' });
graph.addEdge(START, 'init'); graph.addEdge('init', 'validate'); graph.addEdge('validate', 'redact'); graph.addEdge('redact', 'translate');
graph.addEdge('translate', 'shortCircuit'); graph.addEdge('contextNode', 'answerNode'); graph.addEdge('answerNode', 'verifyNode');
graph.addEdge('verifyNode', 'persistNode'); graph.addEdge('persistNode', END);

export const defaultWithLocalModelApp = graph.compile();
export async function runDefaultWithLocalModel(input) { return defaultWithLocalModelApp.invoke(input); }
export default defaultWithLocalModelApp;
