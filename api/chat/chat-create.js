import { withOptionalUser } from '../../middleware/auth.js';
import { withSession } from '../../middleware/session.js';
import { v4 as uuidv4 } from 'uuid';

import SessionManagementService from '../../services/SessionManagementService.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    // If session management is disabled, just return a new UUID
    if (!SessionManagementService.isManagementEnabled()) {
      return res.status(200).json({ chatId: uuidv4() });
    }

    const sessionId = req.sessionId || null;
    if (!sessionId) return res.status(400).json({ error: 'no_session' });

    // Use pre-computed fingerprintKey from middleware to avoid duplication
    const fingerprintKey = req.fingerprintKey;
    const isAuthenticated = !!req.user;

    // Always generate a new chatId for this session
    const reg = await SessionManagementService.register(sessionId, {
      generateChatId: true,
      fingerprintKey,
      isAuthenticated
    });

    if (!reg.ok) {
      return res.status(503).json({
        error: 'could_not_create_chat',
        reason: reg.reason || 'unknown'
      });
    }

    // Return the newly generated chatId from the register result
    return res.status(200).json({ chatId: reg.chatId });
  } catch (e) {
    if (console && console.error) console.error('chat-create error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
}

export default withOptionalUser(withSession(handler));
