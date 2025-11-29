import ServerLoggingService from '../../services/ServerLoggingService.js';
import { AgentOrchestratorService } from '../../agents/AgentOrchestratorService.js';
import { createDetectLanguageAgent } from '../../agents/AgentFactory.js';
import { detectLanguageStrategy } from '../../agents/strategies/detectLanguageStrategy.js';
import { withSession } from '../../middleware/chat-session.js';
import { withOptionalUser } from '../../middleware/auth.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).setHeader('Allow', ['POST']).end(`Method ${req.method} Not Allowed`);

  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const selectedAI = req.body?.selectedAI || 'openai';

  try {
    const createAgentFn = async (agentType, chatId) => {
      // AgentFactory's createDetectLanguageAgent returns an LLM (ChatOpenAI/AzureChatOpenAI)
      return await createDetectLanguageAgent(agentType, chatId);
    };

    const resp = await AgentOrchestratorService.invokeWithStrategy({
      chatId: req.chatId,
      agentType: selectedAI,
      request: { text },
      createAgentFn,
      strategy: detectLanguageStrategy,
    });

    // Normalize response shape for callers
    const result = resp?.result || null;
    ServerLoggingService.info('detect-language result', req.chatId, { result });
    return res.json({ result });
  } catch (err) {
    ServerLoggingService.error('Error in chat-detect-language', req.chatId, err);
    return res.status(500).json({ error: 'internal error' });
  }
}

export default withOptionalUser(withSession(handler));
