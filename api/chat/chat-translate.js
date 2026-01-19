import ServerLoggingService from '../../services/ServerLoggingService.js';
import { translateQuestion as translateService } from '../../services/TranslationAgentService.js';
import { withSession } from '../../middleware/chat-session.js';
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
    // Delegate to the shared translation service used by the graph workflows.
    const resp = await translateService({
      text,
      desiredLanguage: desired_language,
      selectedAI,
      chatId: req.chatId,
      translationContext: translation_context,
    });

    // If the translation service indicates blocked content, forward that.
    if (resp && resp.blocked === true) {
      ServerLoggingService.info('translate blocked - returning minimal blocked response', req.chatId, { resp });
      return res.json({ blocked: true });
    }

    // Ensure returned shape includes originalText and translation_context for callers
    const normalized = Object.assign({}, resp || {}, { originalText: resp && resp.originalText ? resp.originalText : text, translation_context });
    ServerLoggingService.info('translate result', req.chatId, { result: normalized });
    return res.json(normalized);
  } catch (err) {
    ServerLoggingService.error('Error in chat-translate', req.chatId, err);

    // Detect content-safety / provider content-filter errors (e.g., Azure OpenAI filtering)
    try {
      const msg = ((err && err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err?.message || '').toString().toLowerCase();
      const code = ((err && err.response && err.response.data && err.response.data.error && err.response.data.error.code) || err?.code || '').toString().toLowerCase();
      const isContentFilter = msg.includes('filtered') || msg.includes('content policy') || msg.includes('safety') || code.includes('content_filter') || code.includes('content_policy') || /response was filtered due to the prompt triggering/i.test(msg);
      if (isContentFilter) {
        const blockedResp = { blocked: true };
        ServerLoggingService.info('translate blocked - returning minimal blocked response', req.chatId, { blockedResp });
        return res.json(blockedResp);
      }
    } catch (innerErr) {
      ServerLoggingService.error('Error detecting content-filter in chat-translate catch', req.chatId, innerErr);
    }

    return res.status(500).json({ error: 'internal error' });
  }
}

export default withOptionalUser(withSession(handler));
