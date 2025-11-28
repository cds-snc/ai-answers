import SessionManagementService from '../services/SessionManagementService.js';

// Express/Next.js style middleware
export default function sessionMiddleware(options = {}) {
  return async function (req, res, next) {
    try {
      // Check if session management is enabled
      if (!SessionManagementService.isManagementEnabled()) {
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

      // Expose for downstream handlers
      req.sessionId = sessionId;
      req.chatId = chatId;
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
export function ensureSession(req, res) {
  return new Promise((resolve) => {
    try {
      const mw = sessionMiddleware();
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
export function withSession(handler) {
  return async function (req, res) {
    try {
      const ok = await ensureSession(req, res);
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
