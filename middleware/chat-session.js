import ChatSessionService from '../services/ChatSessionService.js';
import ChatSessionMetricsService from '../services/ChatSessionMetricsService.js';
import dbConnect from '../api/db/db-connect.js';
import { v4 as uuidv4 } from 'uuid';
import ConversationIntegrityService from '../services/ConversationIntegrityService.js';

/**
 * Helper: Add a chatId to the session and save.
 */
async function saveChatIdToSession(req, chatId, sessionId) {
  if (!req.session) return;

  try {
    req.session.chatIds = (req.session.chatIds || []).concat(chatId).filter(Boolean);
    if (typeof req.session.save === 'function') {
      console.log('[DEBUG] Saving session...', sessionId);
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
 * If chatId is not found in session, adds it to the session.
 * Always returns the chatId (never blocks the request).
 */
async function resolveIncomingChatId(req, incomingChatId) {
  if (!incomingChatId) return null;

  const sessionId = req.sessionID;
  const session = req.session;
  const hasChatId = (source) => Array.isArray(source) && source.includes(incomingChatId);

  let isValid = hasChatId(session?.chatIds);

  if (!isValid && session) {
    // ChatId not found - add it to the session
    console.log('[session] ChatId not found in session, adding it', incomingChatId);
    try {
      await saveChatIdToSession(req, incomingChatId, sessionId);
      console.log('[session] Successfully added chatId to session', incomingChatId);
      isValid = true;
    } catch (e) {
      console.error('[session] Failed to add chatId to session', e);
      return null;
    }
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

/**
 * Integrity Check: Protect against history tampering on POST requests.
 * @returns {boolean} - True if integrity check passes or is not applicable, false if it fails and response was sent.
 */
export function validateConversationIntegrity(req, res) {
  if (req.method !== 'POST') return true;

  const body = req.body || {};
  const input = body.input || body;
  const history = input.conversationHistory;

  // Only block if history exists but signature is missing/invalid
  if (Array.isArray(history) && history.length > 0) {
    // Extract signature: check top-level, then dig into last AI interaction
    const lastAi = [...history].reverse().find(m => m.sender === 'ai' || (m.interaction && m.interaction.answer));
    const signature = input.historySignature ||
      lastAi?.historySignature ||
      lastAi?.interaction?.historySignature ||
      lastAi?.interaction?.answer?.historySignature ||
      history[0]?.interaction?.answer?.historySignature;

    if (!signature) {
      console.warn('[Integrity] Missing historySignature for non-empty history', { chatId: req.chatId });
      res.status(403).json({
        error: 'missing_signature',
        message: 'Conversation history signature missing'
      });
      return false;
    }

    const isValid = ConversationIntegrityService.verifyHistory(history, signature);
    if (!isValid) {
      console.error('[Integrity] Signature mismatch!', {
        received: signature,
        historyLength: history.length,
        chatId: req.chatId
      });
      res.status(403).json({
        error: 'invalid_signature',
        message: 'Conversation history integrity check failed'
      });
      return false;
    }
  }

  return true;
}

export function withSession(handler, options = {}) {
  return async function (req, res) {
    try {
      const ok = await ensureSession(req, res, options);
      if (!ok) return;

      if (!validateConversationIntegrity(req, res)) return;

      return handler(req, res);
    } catch (e) {
      if (console && console.error) console.error('withSession error', e);
      if (!res.headersSent) res.status(500).json({ error: 'session error' });
      return;
    }
  };
}
