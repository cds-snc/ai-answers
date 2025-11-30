import { withOptionalUser } from '../../middleware/auth.js';
import { withSession } from '../../middleware/chat-session.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!req.chatId) {
    return res.status(400).json({ error: 'no_session' });
  }

  return res.status(200).json({ chatId: req.chatId });
}

export default withOptionalUser(withSession(handler, { createChatId: true }));
