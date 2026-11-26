import { Annotation } from '@langchain/langgraph';

// The one state definition every graph uses. LangGraph silently drops any
// input or node output key that isn't declared here, so a field added to only
// some graphs goes missing in the rest with no error. Add new fields here.
// A channel a graph never writes is harmless: it stays unset.
export const GraphState = Annotation.Root({
  chatId: Annotation(),
  userMessage: Annotation(),
  userMessageId: Annotation(),
  conversationHistory: Annotation(),
  lang: Annotation(),
  department: Annotation(),
  referringUrl: Annotation(),
  serviceProfileId: Annotation(),
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
  // Only the short-circuit graphs (InstantAndQA, DefaultWithVector, DefaultWithLocalModel) write these.
  shortCircuitPayload: Annotation(),
  shortCircuitDebugPayload: Annotation(),
  answer: Annotation(),
  finalCitationUrl: Annotation(),
  status: Annotation(),
  result: Annotation(),
});
