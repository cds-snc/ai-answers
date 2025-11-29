import ChatSessionService from '../services/ChatSessionService.js';
import ChatSessionMetricsService from '../services/ChatSessionMetricsService.js';
import { v4 as uuidv4 } from 'uuid';

export default function sessionMiddleware(options = {}) {
  return async function (req, res, next) {
    try {
      if (!ChatSessionService.isManagementEnabled()) {
        if (options.createChatId) {
          req.chatId = uuidv4();
          return next();
        }
        req.chatId = req.body?.chatId;
        return next();
      }

      if (!req.session) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'no_session', message: 'Missing session; request blocked' }));
      }

      const sessionId = req.sessionID;
      const session = req.session;

      if (options.createChatId) {
        const isAuthenticated = Boolean(
          req.user ||
          (req.session && (
            (req.session.passport && req.session.passport.user) ||
            req.session.user ||
            req.session.userId ||
            req.session.authenticated ||
            req.session.isAuthenticated
          ))
        );

        if (!isAuthenticated) {
          const avail = await ChatSessionService.sessionsAvailable(req.sessionID);
          if (!avail) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              error: 'could_not_create_chat',
              reason: 'sessions_full',
            }));
          }
        }

        const chatId = uuidv4();
        ChatSessionMetricsService.registerChat(sessionId, chatId);

        try {
          req.session.chatIds = (req.session.chatIds || []).concat(chatId).filter(Boolean);
          if (typeof req.session.save === 'function') {
            await new Promise((resolve, reject) => {
              req.session.save((err) => err ? reject(err) : resolve());
            });
          }
        } catch (e) {
          if (console && console.error) console.error('sessionMiddleware save error', e);
        }

        req.chatId = chatId;
      } else {
        let chatId = null;
        const incomingChatId = req.body?.chatId;
        if (incomingChatId) {
          if (session.chatIds && session.chatIds.includes(incomingChatId)) {
            chatId = incomingChatId;
          } else {
            try {
              console.warn('[session] invalid_chatId', { pid: process.pid, sessionId, incomingChatId, sessionChatIds: session.chatIds });
            } catch (e) { }
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'invalid_chatId', message: 'ChatId does not belong to session' }));
          }
        }
        req.chatId = chatId;
        if (chatId) {
          ChatSessionMetricsService.registerChat(sessionId, chatId);
        }
      }

      req.sessionId = sessionId;
      req.visitorId = session.visitorId;
      const rateLimiterSnapshot = req.rateLimiterSnapshot || (req.session && req.session.rateLimiter);
      if (rateLimiterSnapshot) {
        ChatSessionMetricsService.recordRateLimiterSnapshot(sessionId, rateLimiterSnapshot);
      }

      return next();
    } catch (err) {
      if (console && console.error) console.error('sessionMiddleware error', err);
      return next();
    }
  };
}

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

      setImmediate(() => {
        if (!nextCalled && (res.headersSent || res.writableEnded)) {
          return resolve(false);
        }
      });
    } catch (e) {
      return resolve(false);
    }
  });
}

export function withSession(handler, options = {}) {
  return async function (req, res) {
    try {
      const ok = await ensureSession(req, res, options);
      if (!ok) return;
      return handler(req, res);
    } catch (e) {
      if (console && console.error) console.error('withSession error', e);
      if (!res.headersSent) res.status(500).json({ error: 'session error' });
      return;
    }
  };
}
