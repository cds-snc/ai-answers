import { withOptionalUser } from '../../middleware/auth.js';
import { withSession } from '../../middleware/session.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const session = req.session || null;
    // Prefer an explicit chatId mapping if available; session object may contain chatIds array
    const chatId = (session && session.chatIds && session.chatIds.length) ? session.chatIds[0] : (session && session.chatId) || null;
    return res.status(200).json({ chatId });
  } catch (e) {
    if (console && console.error) console.error('chat-session-info error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
}

export default withOptionalUser(withSession(handler));
