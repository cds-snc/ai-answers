// Ensures a hashed visitorId is present in the express session.
// If absent but present in request body, hashes and stores it (lazy init).
// Then validates presence; if still absent, responds with 403 (botDetected).
import crypto from 'crypto';

const fingerprintPepper = process.env.FP_PEPPER || 'dev-pepper';

// Explicit list of routes that require fingerprint verification for anonymous users.
// These are the chat flow endpoints called during user interactions.
const FINGERPRINT_REQUIRED_PATHS = [
  '/api/chat/chat-graph-run',
];

// Explicit list of routes that are always exempt. Currently empty after chat-init removal.
const FINGERPRINT_EXEMPT_PATHS = [];

/**
 * Checks if the URL matches any path in the given list.
 * Uses includes() for flexibility with query strings.
 */
function matchesPath(url, paths) {
  return paths.some(path => url.includes(path));
}

function hashVisitorId(visitorId) {
  return crypto.createHmac('sha256', fingerprintPepper)
    .update(String(visitorId)).digest('hex');
}

function saveSession(req, reason) {
  if (!req?.session || typeof req.session.save !== 'function') {
    return Promise.resolve(false);
  }

  const sessionId = req.sessionID || req.session.id || 'unknown';
  console.info('[botFingerprintPresence] saving session', {
    reason,
    sessionId,
    hasVisitorId: Boolean(req.session.visitorId),
  });

  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        console.error('[botFingerprintPresence] failed to save session', {
          reason,
          sessionId,
          message: err.message,
        });
        reject(err);
        return;
      }
      console.info('[botFingerprintPresence] saved session', {
        reason,
        sessionId,
        hasVisitorId: Boolean(req.session.visitorId),
      });
      resolve(true);
    });
  });
}

export default async function botFingerprintPresence(req, res, next) {
  try {
    const url = (req && (req.originalUrl || req.url || '')) + '';

    // 1. Authenticated users bypass fingerprint check (they're verified by auth)
    if (req.user) {
      return next();
    }

    // 2. Check if this route is explicitly exempt
    if (matchesPath(url, FINGERPRINT_EXEMPT_PATHS)) {
      return next();
    }

    // 3. Check if this route requires fingerprint verification
    if (!matchesPath(url, FINGERPRINT_REQUIRED_PATHS)) {
      // Not in the protected list, allow through
      return next();
    }

    // 4. Route requires fingerprint - validate session exists
    if (!req || !req.session) {
      console.log(`[botFingerprintPresence] BLOCKED (No Session): ${url}`);
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'botDetected', message: 'Session required' }));
    }

    // 5. Lazy init: If visitorId missing from session but present in body, hash and store it now
    const visitorId = req.body?.visitorId || req.body?.input?.visitorId;
    const incomingHashedVisitorId = visitorId ? hashVisitorId(visitorId) : null;

    if (req.session.visitorId && incomingHashedVisitorId && req.session.visitorId !== incomingHashedVisitorId) {
      console.warn('[botFingerprintPresence] BLOCKED (VisitorId mismatch):', {
        url,
        sessionId: req.sessionID || req.session.id || 'unknown',
      });
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'botDetected', message: 'Fingerprint mismatch' }));
    }

    if (!req.session.visitorId && visitorId) {
      req.session.visitorId = incomingHashedVisitorId;
      await saveSession(req, 'visitorId');
    }

    // 6. Validate visitorId is now present in session
    if (!req.session.visitorId) {
      console.log(`[botFingerprintPresence] BLOCKED (No VisitorId): ${url}`);
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'botDetected', message: 'Fingerprint required' }));
    }

    return next();
  } catch (e) {
    if (console && console.error) console.error('botFingerprintPresence error', e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'server_error' }));
  }
}
