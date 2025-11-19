import ServerLoggingService from './ServerLoggingService.js';
import { AgentOrchestratorService } from '../agents/AgentOrchestratorService.js';
import { createPIIAgent } from '../agents/AgentFactory.js';
import piiStrategy from '../agents/strategies/piiStrategy.js';


const invokePIIAgent = async (agentType, request) => {
  const { chatId = 'system' } = request;
  try {
    const result = await AgentOrchestratorService.invokeWithStrategy({
      chatId,
      agentType,
      request,
      createAgentFn: createPIIAgent,
      strategy: piiStrategy,
    });

    return result;
  } catch (err) {
    // Preserve existing content filter logic
    const status = err?.response?.status;
    const dataErr = err?.response?.data?.error;
    const code = (dataErr?.code || err?.code || '').toString().toLowerCase();
    const msg = dataErr?.message || err?.message || '';

    const contentFilter = (
      code.includes('content_filter') ||
      code.includes('content_policy') ||
      /response was filtered due to the prompt triggering Azure OpenAI/i.test(msg)
    );
    ServerLoggingService.error('contentFilter', chatId, { contentFilter, status, code, msg });
    if (contentFilter) {
      const usage = err?.response?.data?.usage || {};
      return {
        pii: null,
        blocked: true,
        inputTokens: usage.prompt_tokens ?? null,
        outputTokens: usage.completion_tokens ?? null,
        model: err?.response?.data?.model ?? null,
      };
    }

    throw err;
  }
};

export { invokePIIAgent };
