import ServerLoggingService from '../../services/ServerLoggingService.js';
import { AgentOrchestratorService } from '../../agents/AgentOrchestratorService.js';
import { createTranslationAgent } from '../../agents/AgentFactory.js';
import { translationStrategy } from '../../agents/strategies/translationStrategy.js';
import { withSession } from '../../middleware/session.js';
import { withOptionalUser } from '../../middleware/auth.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).setHeader('Allow', ['POST']).end(`Method ${req.method} Not Allowed`);

  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const desired_language = req.body?.desired_language || '';
  // Accept either the new `translation_context` key or the older `conversation_history` for backwards compatibility
  const translation_context = Array.isArray(req.body?.translation_context)
    ? req.body.translation_context
    : (Array.isArray(req.body?.conversation_history) ? req.body.conversation_history : []);
  const selectedAI = req.body?.selectedAI || 'openai';

  try {
    const createAgentFn = async (agentType, chatId) => {
      // AgentFactory's createTranslationAgent returns a low-latency LLM instance
      return await createTranslationAgent(agentType, chatId);
    };

    const resp = await AgentOrchestratorService.invokeWithStrategy({
      chatId: 'translate',
      agentType: selectedAI,
      request: { text, desired_language, translation_context },
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
        translation_context: translation_context,
      };
    } else {
      normalized = Object.assign({}, result || {}, { originalText: text, translation_context });
    }

    ServerLoggingService.info('translate result', 'chat-translate', { result: normalized });
    return res.json(normalized);
  } catch (err) {
    ServerLoggingService.error('Error in chat-translate', 'chat-translate', err);

    // Detect content-safety / provider content-filter errors (e.g., Azure OpenAI filtering)
    try {
      const msg = ((err && err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err?.message || '').toString().toLowerCase();
      const code = ((err && err.response && err.response.data && err.response.data.error && err.response.data.error.code) || err?.code || '').toString().toLowerCase();
      const isContentFilter = msg.includes('filtered') || msg.includes('content policy') || msg.includes('safety') || code.includes('content_filter') || code.includes('content_policy') || /response was filtered due to the prompt triggering/i.test(msg);
      if (isContentFilter) {
        const blockedResp = { blocked: true };
        ServerLoggingService.info('translate blocked - returning minimal blocked response', 'chat-translate', { blockedResp });
        return res.json(blockedResp);
      }
    } catch (innerErr) {
      ServerLoggingService.error('Error detecting content-filter in chat-translate catch', 'chat-translate', innerErr);
    }

    return res.status(500).json({ error: 'internal error' });
  }
}

export default withOptionalUser(withSession(handler));
