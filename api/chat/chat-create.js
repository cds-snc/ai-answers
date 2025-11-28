import { withOptionalUser } from '../../middleware/auth.js';
import { withSession } from '../../middleware/chat-session.js';
import SessionManagementService from '../../services/SessionManagementService.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  // req.chatId is now populated by middleware (either new or manually generated if disabled)
  const sessionEnabled = SessionManagementService.isManagementEnabled();

  return res.status(200).json({ 
    chatId: req.chatId, 
    sessionManagementEnabled: sessionEnabled 
  });
}

export default withOptionalUser(withSession(handler, { createChatId: true }));
