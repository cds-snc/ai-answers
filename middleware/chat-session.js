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

  // Store chatIds as a plain object map to avoid array serialization/race issues
  // e.g. { "<chatId>": true }
  const existing = (req.session.chatIds && typeof req.session.chatIds === 'object') ? { ...req.session.chatIds } : {};
  existing[String(chatId)] = true;
  req.session.chatIds = existing;

  console.log('[session] saving chatId:', chatId, 'sessionID:', req.sessionID, 'chatIds:', req.session.chatIds);
  // No explicit save needed - express-session auto-saves when response ends
  // (now that chat-graph-run returns immediately before SSE starts)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Check if a chatId already belongs to this session
// ─────────────────────────────────────────────────────────────────────────────
function chatIdBelongsToSession(req, chatId) {
  return Boolean(
    chatId &&
    req.session &&
    req.session.chatIds &&
    typeof req.session.chatIds === 'object' &&
    Object.prototype.hasOwnProperty.call(req.session.chatIds, chatId)
  );
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
async function handleSessionRecovery(req, res, managementEnabled) {
  const session = req.session;
  const hasChatIds = session && session.chatIds && typeof session.chatIds === 'object' && Object.keys(session.chatIds).length > 0;
  const isExpired = !session || (!hasChatIds && !isAuthenticated(req));

  // Skip recovery check if session isn't expired or management is disabled
  if (!managementEnabled || !isExpired) {
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
async function handleIncomingChatId(req, res, managementEnabled) {
  const incomingChatId = req.body?.chatId || req.body?.input?.chatId;

  // If no chatId provided, always generate a new one (no reuse)
  if (!incomingChatId) {
    const result = await createNewChatId(req, res, managementEnabled);
    return result;
  }

  if (!chatIdBelongsToSession(req, incomingChatId)) {
    sendError(res, 403, 'invalid_chatId', 'ChatId does not belong to session');
    return { chatId: null, error: true };
  }

  return { chatId: incomingChatId };
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

    // Record rate limiter metrics from request snapshot (not session - removed)
    const rateLimiterSnapshot = req.rateLimiterSnapshot;
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
export default function sessionMiddleware() {
  return async function (req, res, next) {
    try {
      const managementEnabled = ChatSessionService.isManagementEnabled();

      // 0. Initialize visitorId from body if missing in session (Lazy Init / Recovery)
      if (req.session && !req.session.visitorId && req.body?.input?.visitorId) {
        const hashedVisitorId = crypto.createHmac('sha256', fingerprintPepper)
          .update(String(req.body.visitorId)).digest('hex');
        //req.session.visitorId = hashedVisitorId;
      }

      // 1. Require session when management is enabled
      if (managementEnabled && !req.session) {
        sendError(res, 403, 'no_session', 'Missing session; request blocked');
        return;
      }

      // 2. Handle session recovery for expired sessions
      const recovery = await handleSessionRecovery(req, res, managementEnabled);
      if (!recovery.proceed) return;

      // 3. Resolve chatId (create new or validate incoming)
      // Always handle incoming chatId (this will create a new chatId when none provided)
      let chatId = null;
      const result = await handleIncomingChatId(req, res, managementEnabled);
      if (result.error) return;
      chatId = result.chatId;

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
export function ensureSession(req, res) {
  return new Promise((resolve) => {
    const mw = sessionMiddleware();
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
  const historyArray = Array.isArray(history) ? history : [];

  // Filter out error messages - they don't participate in integrity checking
  const filteredHistory = historyArray.filter(m => !m.error);

  if (filteredHistory.length === 0) return true;

  // Delegate prefix-signature extraction and verification to the integrity service
  const verification = ConversationIntegrityService.verifySignedPrefix(historyArray, input.historySignature);

  if (!verification.valid) {
    if (verification.reason === 'missing_signature') {
      console.warn('[Integrity] Missing historySignature for non-empty history', { chatId: req.chatId });
      res.status(403).json({ error: 'missing_signature', message: 'Conversation history signature missing' });
      return false;
    }
    if (verification.reason === 'invalid_signature') {
      console.error('[Integrity] Signature mismatch!', { received: verification.signature, historyLength: history.length, chatId: req.chatId });
      res.status(403).json({ error: 'invalid_signature', message: 'Conversation history integrity check failed' });
      return false;
    }
    // Unknown reason -> block by default
    console.error('[Integrity] Verification failed', { reason: verification.reason, chatId: req.chatId });
    res.status(403).json({ error: 'invalid_signature', message: 'Conversation history integrity check failed' });
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOF Wrapper: withChatSession (combines session + integrity checks)
// Use for endpoints that create/validate chatIds (e.g., chat-graph-run)
// ─────────────────────────────────────────────────────────────────────────────
export function withChatSession(handler) {
  return async function (req, res) {
    try {
      const ok = await ensureSession(req, res);
      if (!ok) return;

      if (!validateConversationIntegrity(req, res)) return;

      return handler(req, res);
    } catch (e) {
      console.error('withChatSession error', e);
      if (!res.headersSent) res.status(500).json({ error: 'session error' });
    }
  };
}

export const withSession = withChatSession;
