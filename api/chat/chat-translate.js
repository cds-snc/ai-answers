import ServerLoggingService from '../../services/ServerLoggingService.js';
import { AgentOrchestratorService } from '../../agents/AgentOrchestratorService.js';
import { createTranslationAgent } from '../../agents/AgentFactory.js';
import { translationStrategy } from '../../agents/strategies/translationStrategy.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).setHeader('Allow', ['POST']).end(`Method ${req.method} Not Allowed`);

  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const desired_language = req.body?.desired_language || '';
  const selectedAI = req.body?.selectedAI || 'openai';

  try {
    const createAgentFn = async (agentType, chatId) => {
      // AgentFactory's createTranslationAgent returns a low-latency LLM instance
      return await createTranslationAgent(agentType, chatId);
    };

    const resp = await AgentOrchestratorService.invokeWithStrategy({
      chatId: 'translate',
      agentType: selectedAI,
      request: { text, desired_language },
      createAgentFn,
      strategy: translationStrategy,
    });
    const result = resp?.result || null;

    // Normalize the agent's response here so callers receive a consistent shape.
    // Ensure originalText is always present and handle the no-translation no-op form.
    let normalized = null;
    if (result && result.noTranslation === true) {
      normalized = {
        originalLanguage: result.originalLanguage || null,
        translatedLanguage: desired_language,
        translatedText: text,
        noTranslation: true,
        originalText: text,
      };
    } else {
      normalized = Object.assign({}, result || {}, { originalText: text });
    }

    ServerLoggingService.info('translate result', 'chat-translate', { result: normalized });
    return res.json(normalized);
  } catch (err) {
    ServerLoggingService.error('Error in chat-translate', 'chat-translate', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
