import ServerLoggingService from '../services/ServerLoggingService.js';

class AgentOrchestratorServiceClass {
  async invokeWithStrategy({
    chatId = 'system',
    agentType = 'openai',
    request = {},
    createAgentFn, // (agentType, chatId) => agent
    strategy,
  }) {
    if (!createAgentFn) throw new Error('createAgentFn is required');
    if (!strategy || typeof strategy.buildMessages !== 'function' || typeof strategy.parse !== 'function') {
      throw new Error('strategy with buildMessages and parse is required');
    }

    try {
      const agent = await createAgentFn(agentType, chatId);
      const messages = strategy.buildMessages(request);


      const answer = await agent.invoke(messages);

      // Normalize different agent return shapes:
      // - LangGraph/react agents: { messages: [...] }
      // - Direct LLM/chat model calls: return a BaseMessage or an object with content
      let lastResult = null;
      if (Array.isArray(answer?.messages) && answer.messages.length) {
        lastResult = answer.messages[answer.messages.length - 1];
      }
      else if (answer) {
        // ChatOpenAI.invoke and similar return a BaseMessage-like object.
        // Some wrappers may return { message }.
        lastResult = answer.message ?? answer;
      }

      if (!lastResult) {
        if (typeof ServerLoggingService?.warn === 'function') {
          ServerLoggingService.warn('No messages returned by agent', chatId);
        }
        return { error: 'no_messages' };
      }

      // Minimal unified metadata extraction from several possible locations
      const meta = lastResult.response_metadata || lastResult.generationInfo || answer?.llmOutput || {};
      // token usage may live in several fields depending on provider/wrapper
      const tokenUsage = meta.tokenUsage || meta.usage || lastResult.usage_metadata || answer?.llmOutput?.tokenUsage || {};
      const content = lastResult.content ?? lastResult.text ?? (lastResult.message && (lastResult.message.content ?? lastResult.message.text)) ?? '';
      const normalized = {
        content,
        model: meta.model_name || meta.model || null,
        inputTokens: tokenUsage.promptTokens ?? tokenUsage.prompt_tokens ?? tokenUsage.input_tokens ?? tokenUsage.prompt_tokens ?? null,
        outputTokens: tokenUsage.completionTokens ?? tokenUsage.completion_tokens ?? tokenUsage.output_tokens ?? null,
        raw: lastResult,
      };

      const parsed = await strategy.parse(normalized, request);

      // Attach common telemetry fields if not provided
      if (parsed && typeof parsed === 'object') {
        return {
          ...parsed,
          model: parsed.model ?? normalized.model,
          inputTokens: parsed.inputTokens ?? normalized.inputTokens,
          outputTokens: parsed.outputTokens ?? normalized.outputTokens,
        };
      }
      return parsed;
    } catch (err) {
      if (typeof ServerLoggingService?.error === 'function') {
        ServerLoggingService.error('Agent orchestrator error', chatId, err);
      }
      if (typeof strategy.onError === 'function') {
        const mapped = await strategy.onError(err, request);
        if (mapped !== undefined) return mapped;
      }
      throw err;
    }
  }
}

export const AgentOrchestratorService = new AgentOrchestratorServiceClass();
export { AgentOrchestratorServiceClass };
export default AgentOrchestratorService;
