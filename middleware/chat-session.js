import ChatSessionService from '../services/ChatSessionService.js';
import ChatSessionMetricsService from '../services/ChatSessionMetricsService.js';
import { v4 as uuidv4 } from 'uuid';
import ConversationIntegrityService from '../services/ConversationIntegrityService.js';
import crypto from 'crypto';

const fingerprintPepper = process.env.FP_PEPPER || 'dev-pepper';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Check if the user is authenticated
// ─────────────────────────────────────────────────────────────────────────────
function isAuthenticated(req) {
  return Boolean(
    req.user ||
    (req.session && (
      req.session.passport?.user ||
      req.session.user ||
      req.session.userId ||
      req.session.authenticated ||
      req.session.isAuthenticated
    ))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Save chatId to session
// ─────────────────────────────────────────────────────────────────────────────
async function saveChatIdToSession(req, chatId) {
  if (!req.session) return;

  req.session.chatIds = (req.session.chatIds || []).concat(chatId).filter(Boolean);

  if (typeof req.session.save === 'function') {
    await new Promise((resolve, reject) => {
      req.session.save((err) => err ? reject(err) : resolve());
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Resolve/validate an incoming chatId against the current session
// ─────────────────────────────────────────────────────────────────────────────
async function resolveIncomingChatId(req, incomingChatId) {
  if (!incomingChatId) return null;

  const session = req.session;
  const hasChatId = Array.isArray(session?.chatIds) && session.chatIds.includes(incomingChatId);

  if (!hasChatId && session) {
    // ChatId not found in session - adopt it
    try {
      await saveChatIdToSession(req, incomingChatId);
      return incomingChatId;
    } catch (e) {
      console.error('[session] Failed to adopt chatId', e);
      return null;
    }
  }

  return hasChatId ? incomingChatId : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Send JSON error response
// ─────────────────────────────────────────────────────────────────────────────
function sendError(res, statusCode, error, message) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error, message }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Handle session recovery for expired/missing sessions
// Returns: { proceed: boolean, response?: sent }
// ─────────────────────────────────────────────────────────────────────────────
async function handleSessionRecovery(req, res, managementEnabled, options) {
  const session = req.session;
  const isExpired = !session || (!session.chatIds && !isAuthenticated(req));

  // Skip recovery check if we're creating a new chat or session isn't expired
  if (!managementEnabled || !isExpired || options.createChatId) {
    return { proceed: true };
  }

  if (isAuthenticated(req)) {
    // Authenticated user with expired session -> force re-login
    sendError(res, 401, 'session_expired', 'Please log in again');
    return { proceed: false };
  }

  // Anonymous user -> check capacity for recovery
  const recoveryAvailable = await ChatSessionService.sessionsAvailable(null);
  if (!recoveryAvailable) {
    sendError(res, 503, 'service_unavailable', 'Service temporarily unavailable');
    return { proceed: false };
  }

  return { proceed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Create a new chatId and save to session
// Returns: { chatId: string|null, error?: boolean }
// ─────────────────────────────────────────────────────────────────────────────
async function createNewChatId(req, res, managementEnabled) {
  // Check availability for unauthenticated users
  if (managementEnabled && !isAuthenticated(req)) {
    const avail = await ChatSessionService.sessionsAvailable(req.sessionID);
    if (!avail) {
      sendError(res, 503, 'could_not_create_chat', 'Session capacity reached');
      return { chatId: null, error: true };
    }
  }

  const chatId = uuidv4();

  if (req.session) {
    try {
      await saveChatIdToSession(req, chatId);
    } catch (e) {
      if (managementEnabled) {
        sendError(res, 500, 'no_session', 'Could not save ChatId to session: ' + e.message);
        return { chatId: null, error: true };
      }
      console.error('[session] Failed to save chatId but continuing', e);
    }
  }

  return { chatId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Handle incoming chatId validation
// Returns: { chatId: string|null, error?: boolean }
// ─────────────────────────────────────────────────────────────────────────────
async function handleIncomingChatId(req, res) {
  const incomingChatId = req.body?.chatId;
  if (!incomingChatId) {
    return { chatId: null };
  }

  const chatId = await resolveIncomingChatId(req, incomingChatId);
  if (!chatId) {
    sendError(res, 403, 'invalid_chatId', 'ChatId does not belong to session');
    return { chatId: null, error: true };
  }

  return { chatId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Update request properties and record metrics
// ─────────────────────────────────────────────────────────────────────────────
function finalizeRequest(req, chatId) {
  const session = req.session;
  const sessionId = req.sessionID;

  req.chatId = chatId;

  if (session) {
    req.sessionId = sessionId;
    req.visitorId = session.visitorId;
    session.lastSeen = Date.now();

    const rateLimiterSnapshot = req.rateLimiterSnapshot || session.rateLimiter;
    if (rateLimiterSnapshot) {
      ChatSessionMetricsService.recordRateLimiterSnapshot(sessionId, rateLimiterSnapshot);
    }
  }

  if (chatId && sessionId) {
    ChatSessionMetricsService.registerChat(sessionId, chatId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Middleware Factory
// ─────────────────────────────────────────────────────────────────────────────
export default function sessionMiddleware(options = {}) {
  return async function (req, res, next) {
    try {
      const managementEnabled = ChatSessionService.isManagementEnabled();

      // 0. Initialize visitorId from body if missing in session (Lazy Init / Recovery)
      if (req.session && !req.session.visitorId && req.body?.visitorId) {
        const hashedVisitorId = crypto.createHmac('sha256', fingerprintPepper)
          .update(String(req.body.visitorId)).digest('hex');
        req.session.visitorId = hashedVisitorId;
      }

      // 1. Require session when management is enabled
      if (managementEnabled && !req.session) {
        sendError(res, 403, 'no_session', 'Missing session; request blocked');
        return;
      }

      // 2. Handle session recovery for expired sessions
      const recovery = await handleSessionRecovery(req, res, managementEnabled, options);
      if (!recovery.proceed) return;

      // 3. Resolve chatId (create new or validate incoming)
      let chatId = null;
      if (options.createChatId) {
        const result = await createNewChatId(req, res, managementEnabled);
        if (result.error) return;
        chatId = result.chatId;
      } else {
        const result = await handleIncomingChatId(req, res);
        if (result.error) return;
        chatId = result.chatId;
      }

      // 4. Finalize request properties and metrics
      finalizeRequest(req, chatId);

      return next();
    } catch (err) {
      console.error('sessionMiddleware error', err);
      return next();
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper: ensureSession (Promise-based middleware invocation)
// ─────────────────────────────────────────────────────────────────────────────
export function ensureSession(req, res, options = {}) {
  return new Promise((resolve) => {
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
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Integrity Check: Protect against conversation history tampering
// ─────────────────────────────────────────────────────────────────────────────
export function validateConversationIntegrity(req, res) {
  if (req.method !== 'POST') return true;

  const body = req.body || {};
  const input = body.input || body;
  const history = input.conversationHistory;

  // Filter out error messages - they don't participate in integrity checking
  const filteredHistory = Array.isArray(history) ? history.filter(m => !m.error) : [];

  if (filteredHistory.length === 0) return true;

  // Extract signature from various possible locations
  const lastAi = [...filteredHistory].reverse().find(m => m.sender === 'ai' || m.interaction?.answer);
  const signature = input.historySignature ||
    lastAi?.historySignature ||
    lastAi?.interaction?.historySignature ||
    lastAi?.interaction?.answer?.historySignature ||
    filteredHistory[0]?.interaction?.answer?.historySignature;

  if (!signature) {
    console.warn('[Integrity] Missing historySignature for non-empty history', { chatId: req.chatId });
    res.status(403).json({ error: 'missing_signature', message: 'Conversation history signature missing' });
    return false;
  }

  if (!ConversationIntegrityService.verifyHistory(history, signature)) {
    console.error('[Integrity] Signature mismatch!', { received: signature, historyLength: history.length, chatId: req.chatId });
    res.status(403).json({ error: 'invalid_signature', message: 'Conversation history integrity check failed' });
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOF Wrapper: withSession (combines session + integrity checks)
// ─────────────────────────────────────────────────────────────────────────────
export function withSession(handler, options = {}) {
  return async function (req, res) {
    try {
      const ok = await ensureSession(req, res, options);
      if (!ok) return;

      if (!validateConversationIntegrity(req, res)) return;

      return handler(req, res);
    } catch (e) {
      console.error('withSession error', e);
      if (!res.headersSent) res.status(500).json({ error: 'session error' });
    }
  };
}
