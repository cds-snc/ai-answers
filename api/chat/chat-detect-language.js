import ServerLoggingService from '../../services/ServerLoggingService.js';
import { AgentOrchestratorService } from '../../agents/AgentOrchestratorService.js';
import { createDetectLanguageAgent } from '../../agents/AgentFactory.js';
import { detectLanguageStrategy } from '../../agents/strategies/detectLanguageStrategy.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).setHeader('Allow', ['POST']).end(`Method ${req.method} Not Allowed`);

  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const selectedAI = req.body?.selectedAI || 'openai';

  try {
    const createAgentFn = async (agentType, chatId) => {
      // AgentFactory's createDetectLanguageAgent returns an LLM (ChatOpenAI/AzureChatOpenAI)
      return await createDetectLanguageAgent(agentType, chatId);
    };

    const resp = await AgentOrchestratorService.invokeWithStrategy({
      chatId: 'detect-language',
      agentType: selectedAI,
      request: { text },
      createAgentFn,
      strategy: detectLanguageStrategy,
    });

    // Normalize response shape for callers
    const result = resp?.result || null;
    ServerLoggingService.info('detect-language result', 'chat-detect-language', { result });
    return res.json({ result });
  } catch (err) {
    ServerLoggingService.error('Error in chat-detect-language', 'chat-detect-language', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
