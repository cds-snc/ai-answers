import { withChatSession } from '../../middleware/chat-session.js';
import { withOptionalUser } from '../../middleware/auth.js';
import { withBotProtection } from '../../middleware/bot-protection.js';
import { withRateLimiter } from '../../middleware/rate-limiter.js';
import ChatSessionService from '../../services/ChatSessionService.js';
import ChatSessionMetricsService from '../../services/ChatSessionMetricsService.js';

export async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // If session management is disabled, just return success without recording
    if (!ChatSessionService.isManagementEnabled()) {
      return res.status(200).json({ ok: true });
    }

    const { latencyMs, error, errorType } = req.body || {};
    const chatId = req.chatId;
    if (!chatId) return res.status(400).json({ error: 'missing_chatId' });

    const ok = ChatSessionMetricsService.recordRequest(chatId, { latencyMs: Number(latencyMs) || 0, error: !!error, errorType });
    if (!ok) return res.status(404).json({ error: 'no_session' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    if (console && console.error) console.error('chat-report error', e);
    return res.status(500).json({ error: 'server_error' });
  }
}
export default withOptionalUser(withRateLimiter(withBotProtection(withChatSession(handler))));
