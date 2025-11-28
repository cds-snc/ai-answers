import { withOptionalUser } from '../../middleware/auth.js';
import { withSession } from '../../middleware/chat-session.js';
import SessionManagementService from '../../services/SessionManagementService.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const sessionId = req.sessionId || null;
    if (!sessionId) {
      return res.status(400).json({ error: 'no_session' });
    }

    // Generate a new UUID chatId for this batch item (same as chat-create.js)
    const reg = await SessionManagementService.registerChat(sessionId, {
      generateChatId: true,
    });

    if (!reg.ok) {
      return res.status(503).json({
        error: 'could_not_create_batch_chat',
        reason: reg.reason || 'unknown',
      });
    }

    // Return the newly generated chatId from the register result
    return res.status(200).json({ chatId: reg.chatId });
  } catch (e) {
    if (console && console.error) {
      console.error('batch-register-chatid error', e);
    }
    return res.status(500).json({ error: 'internal_error' });
  }
}

export default withOptionalUser(withSession(handler));
