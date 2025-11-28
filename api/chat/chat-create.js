import { withOptionalUser } from '../../middleware/auth.js';
import { withSession } from '../../middleware/chat-session.js';
import { v4 as uuidv4 } from 'uuid';

import SessionManagementService from '../../services/SessionManagementService.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    // If session management is disabled, just return a new UUID
    const sessionEnabled = SessionManagementService.isManagementEnabled();
    if (!sessionEnabled) {
      return res.status(200).json({ chatId: uuidv4(), sessionManagementEnabled: false });
    }

    const sessionId = req.sessionId || null;
    if (!sessionId) return res.status(400).json({ error: 'no_session' });

    // Always generate a new chatId for this session
    const reg = await SessionManagementService.registerChat(sessionId, {
      generateChatId: true
    });

    if (!reg.ok) {
      return res.status(503).json({
        error: 'could_not_create_chat',
        reason: reg.reason || 'unknown',
        sessionManagementEnabled: true
      });
    }

    // Persist the new chatId into the express-session so subsequent requests
    // will include it (SessionManagementService.syncSession reads from
    // `req.session.chatIds`). Best-effort: if save fails, we still return
    // the chatId to the client but log the error.
    try {
      if (req.session) {
        // Ensure session.chatIds contains the latest list from the management service
        req.session.chatIds = (reg.session && reg.session.chatIds) ? reg.session.chatIds : (req.session.chatIds || []).concat(reg.chatId).filter(Boolean);
        if (typeof req.session.save === 'function') {
          await new Promise((resolve, reject) => {
            req.session.save((err) => err ? reject(err) : resolve());
          });
        }
      }
    } catch (e) {
      if (console && console.error) console.error('chat-create session save error', e);
    }

    // Return the newly generated chatId from the register result and indicate session management is enabled
    return res.status(200).json({ chatId: reg.chatId, sessionManagementEnabled: true });
  } catch (e) {
    if (console && console.error) console.error('chat-create error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
}

export default withOptionalUser(withSession(handler));
