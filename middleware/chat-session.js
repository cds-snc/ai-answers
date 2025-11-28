import SessionManagementService from '../services/SessionManagementService.js';
import { v4 as uuidv4 } from 'uuid';

// Express/Next.js style middleware
export default function sessionMiddleware(options = {}) {
  return async function (req, res, next) {
    try {
      // Check if session management is enabled
      if (!SessionManagementService.isManagementEnabled()) {
        // If management is disabled but we are asked to create a chat ID, do it manually
        if (options.createChatId) {
          req.chatId = uuidv4();
          return next();
        }
        req.chatId = req.body?.chatId;
        return next();
      }

      // express-session middleware should have already run and populated req.session
      if (!req.session) {
        // If express-session is missing or failed, we can't proceed with session logic
        // But we shouldn't block if it's just not configured yet, though in this app it should be.
        // For now, just pass through.
        return next();
      }

      const sessionId = req.sessionID;
      const session = req.session;

      // Sync session data with SessionManagementService (metrics, mapping)
      // This ensures the service knows about this active session
      await SessionManagementService.syncSession(session, sessionId);

      // If options.createChatId is true, we must generate and register a new chat ID
      if (options.createChatId) {
        const reg = await SessionManagementService.registerChat(sessionId, {
          generateChatId: true,
        });

        if (!reg.ok) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({
            error: 'could_not_create_chat',
            reason: reg.reason || 'unknown',
          }));
        }

        // Persist the new chatId into the express-session
        try {
          req.session.chatIds = (reg.session && reg.session.chatIds) ? reg.session.chatIds : (req.session.chatIds || []).concat(reg.chatId).filter(Boolean);
          if (typeof req.session.save === 'function') {
            await new Promise((resolve, reject) => {
              req.session.save((err) => err ? reject(err) : resolve());
            });
          }
        } catch (e) {
          if (console && console.error) console.error('sessionMiddleware save error', e);
        }

        req.chatId = reg.chatId;
        // We created a new one, so we don't check body
      } else {
        // Validate chatId from request body if provided
        let chatId = null;
        const incomingChatId = req.body?.chatId;
        if (incomingChatId) {
          if (session.chatIds && session.chatIds.includes(incomingChatId)) {
            chatId = incomingChatId;
          } else {
            try {
              console.warn('[session] invalid_chatId', { pid: process.pid, sessionId, incomingChatId, sessionChatIds: session.chatIds });
            } catch (e) { /* best-effort logging */ }
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'invalid_chatId', message: 'ChatId does not belong to session' }));
          }
        }
        req.chatId = chatId;
      }

      // Expose for downstream handlers
      req.sessionId = sessionId;
      // visitorId is set by bot-fingerprint-presence and stored in session
      req.visitorId = session.visitorId;

      return next();
    } catch (err) {
      if (console && console.error) console.error('sessionMiddleware error', err);
      return next();
    }
  };
}

// Helper that adapts the Express-style middleware to an awaitable guard
export function ensureSession(req, res, options = {}) {
  return new Promise((resolve) => {
    try {
      const mw = sessionMiddleware(options);
      let nextCalled = false;
      mw(req, res, (err) => {
        if (err) return resolve(false);
        nextCalled = true;
        return resolve(true);
      });

      // If middleware synchronously wrote a response, short-circuit
      setImmediate(() => {
        if (!nextCalled && (res.headersSent || res.writableEnded)) {
          return resolve(false);
        }
        // otherwise wait for middleware to call next
      });
    } catch (e) {
      // On unexpected errors, block the handler
      return resolve(false);
    }
  });
}

// Wrapper to make it easy to include session handling in individual handlers.
// Usage: export default withSession(myHandler);
export function withSession(handler, options = {}) {
  return async function (req, res) {
    try {
      const ok = await ensureSession(req, res, options);
      if (!ok) return; // middleware already handled the response
      return handler(req, res);
    } catch (e) {
      if (console && console.error) console.error('withSession error', e);
      // If session step fails unexpectedly, block the request to be safe
      if (!res.headersSent) res.status(500).json({ error: 'session error' });
      return;
    }
  };
}
