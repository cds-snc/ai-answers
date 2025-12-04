import ChatSessionService from '../services/ChatSessionService.js';
import ChatSessionMetricsService from '../services/ChatSessionMetricsService.js';
import dbConnect from '../api/db/db-connect.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Helper: Add a chatId to the session and save.
 */
async function saveChatIdToSession(req, chatId, sessionId) {
  if (!req.session) return;
  
  try {
    req.session.chatIds = (req.session.chatIds || []).concat(chatId).filter(Boolean);
    if (typeof req.session.save === 'function') {
      await new Promise((resolve, reject) => {
        req.session.save((err) => err ? reject(err) : resolve());
      });
      console.log('[session] Saved chatId', chatId, 'to session', sessionId);
    }
  } catch (e) {
    console.error('[session] Could not save chatId to session', e);
    throw e;
  }
}

/**
 * Helper: Resolve/validate an incoming chatId against the current session.
 * Tries reload, sessionStore lookup, and adds the chatId to session if invalid.
 * Always returns the chatId (never blocks the request).
 */
async function resolveIncomingChatId(req, incomingChatId) {
  if (!incomingChatId) return null;

  const sessionId = req.sessionID;
  const session = req.session;
  const hasChatId = (source) => Array.isArray(source) && source.includes(incomingChatId);

  let isValid = hasChatId(session?.chatIds);

  // Try reloading the session
  if (!isValid && session && typeof session.reload === 'function') {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const delay = attempt * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        await new Promise((resolve, reject) => session.reload((err) => err ? reject(err) : resolve()));
        isValid = hasChatId(req.session?.chatIds);
        if (isValid) {
          console.log(`[session] Recovered chatId after reload (attempt ${attempt})`, incomingChatId);
          break;
        }
      } catch (e) {
        console.warn(`[session] Reload failed (attempt ${attempt})`, e);
      }
    }
  }

  // Try session store lookup
  if (!isValid && req.sessionStore && typeof req.sessionStore.get === 'function') {
    try {
      const persisted = await new Promise((resolve, reject) => {
        req.sessionStore.get(sessionId, (err, data) => err ? reject(err) : resolve(data));
      });
      const persistedChatIds = Array.isArray(persisted?.chatIds) ? persisted.chatIds.filter(Boolean) : [];
      if (persistedChatIds.length && session) {
        session.chatIds = persistedChatIds;
        req.session.chatIds = persistedChatIds;
      }
      isValid = hasChatId(persistedChatIds);
      if (isValid) {
        console.log('[session] Recovered chatId from store lookup', incomingChatId);
      }
    } catch (e) {
      console.warn('[session] sessionStore.get failed', e);
    }
  }

  if (!isValid) {
    // ChatId not found - log error and return null to block request
    const userEmail = req.user?.email || req.session?.passport?.user?.email || req.session?.user?.email;
    try {
      console.error('[session] invalid_chatId - blocking request', { 
        pid: process.pid, 
        sessionId, 
        incomingChatId, 
        sessionChatIds: session?.chatIds,
        userEmail 
      });
    } catch (e) { }
    return null;
  }

  return incomingChatId;
}

/**
 * Helper: Check if the user is authenticated.
 */
function isAuthenticated(req) {
  return Boolean(
    req.user ||
    (req.session && (
      (req.session.passport && req.session.passport.user) ||
      req.session.user ||
      req.session.userId ||
      req.session.authenticated ||
      req.session.isAuthenticated
    ))
  );
}

export default function sessionMiddleware(options = {}) {
  return async function (req, res, next) {
    try {
      const managementEnabled = ChatSessionService.isManagementEnabled();
      
      // Require session when management is enabled
      if (managementEnabled && !req.session) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'no_session', message: 'Missing session; request blocked' }));
      }

      const sessionId = req.sessionID;
      const session = req.session;
      let chatId = null;

      if (options.createChatId) {
        // Check session availability for unauthenticated users when management is enabled
        if (managementEnabled && !isAuthenticated(req)) {
          const avail = await ChatSessionService.sessionsAvailable(sessionId);
          if (!avail) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              error: 'could_not_create_chat',
              reason: 'sessions_full',
            }));
          }
        }

        // Create new chatId
        chatId = uuidv4();

        // Save to session if available
        if (session) {
          try {
            await saveChatIdToSession(req, chatId, sessionId);
          } catch (e) {
            if (managementEnabled) {
              // Only block request when management is enabled
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ 
                error: 'no_session', 
                message: 'Could not add ChatId to session: ' + e.message 
              }));
            }
            // Otherwise just log and continue
            console.error('[session] Failed to save chatId but continuing', e);
          }
        }
      } else {
        // Handle incoming chatId
        const incomingChatId = req.body?.chatId;
        if (incomingChatId) {
          chatId = await resolveIncomingChatId(req, incomingChatId);
          if (!chatId) {
            // ChatId validation failed - block request
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ 
              error: 'invalid_chatId', 
              message: 'ChatId does not belong to session' 
            }));
          }
        }
      }

      // Register metrics for all modes
      if (chatId && sessionId) {
        ChatSessionMetricsService.registerChat(sessionId, chatId);
      }

      // Set request properties
      req.chatId = chatId;
      if (session) {
        req.sessionId = sessionId;
        req.visitorId = session.visitorId;
        
        const rateLimiterSnapshot = req.rateLimiterSnapshot || session.rateLimiter;
        if (rateLimiterSnapshot) {
          ChatSessionMetricsService.recordRateLimiterSnapshot(sessionId, rateLimiterSnapshot);
        }
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
