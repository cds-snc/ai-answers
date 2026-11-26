import { logGraphEvent } from '../GraphEventLogger.js';

// The redact and translate nodes every graph shares. They live here, once,
// because of one rule (AIA-018): until postTranslateGuard passes, the question
// may still be blocked, and a blocked question must leave no trace in any log.
// So nothing these nodes log before the guard may carry the question text —
// not userMessage, not redactedText, not translationData. After the guard
// passes, the question may be logged (node:translate output onwards).
//
// A new graph gets the rule by using these factories; it needs no AIA-018 code
// of its own. blockedQuestionLogs.security.test.js runs every registered graph.

export function createRedactNode(workflow) {
  return async (state) => {
    logGraphEvent('info', 'node:redact input', state.chatId, {
      lang: state.lang,
      selectedAI: state.selectedAI,
    });

    const { redactedText } = await workflow.processRedaction(state.userMessage, state.lang, state.chatId, state.selectedAI);

    logGraphEvent('info', 'node:redact output', state.chatId, {});
    return { redactedText };
  };
}

// status: the workflow status to report once translate finishes, or none. Each
// status update is streamed to the browser (chat-graph-run.js), so the choice is
// the graph's: each passes what it reported after translate before this node
// was shared.
export function createTranslateNode(workflow, { status } = {}) {
  return async (state) => {
    const translationContext = workflow.buildTranslationContext(state.conversationHistory);
    // Safe to log before the guard only because callers pass verified history:
    // the chat route's withChatSession replaces conversationHistory with the
    // server's completed turns. Batch runs pass their earlier completed turns as
    // 'ai' entries only, which buildTranslationContext drops (it keeps 'user'
    // entries), so their context is empty. A new entry point that passes
    // client-supplied history would break AIA-018 here.
    logGraphEvent('info', 'node:translate input', state.chatId, {
      translationContext,
      selectedAI: state.selectedAI,
    });

    const translationData = await workflow.translateQuestion({
      text: state.redactedText,
      lang: 'en',
      selectedAI: state.selectedAI,
      translationContext,
      chatId: state.chatId,
    });
    await workflow.postTranslateGuard(translationData, state.chatId, state.selectedAI);

    // Past the guard: the question is allowed in logs from here on.
    const out = status ? { translationData, status } : { translationData };
    logGraphEvent('info', 'node:translate output', state.chatId, out);
    return out;
  };
}
