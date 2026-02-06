// Ensures a hashed visitorId is present in the express session.
// If absent, responds with 403 (botDetected).

// Explicit list of routes that require fingerprint verification for anonymous users.
// These are the chat flow endpoints called during user interactions.
const FINGERPRINT_REQUIRED_PATHS = [
  '/api/chat/chat-message',
  '/api/chat/chat-context',
  '/api/chat/chat-graph-run',
  '/api/chat/chat-pii-check',
  '/api/chat/chat-detect-language',
  '/api/chat/chat-translate',
  '/api/chat/chat-similar-answer',
  '/api/chat/chat-report',
  '/api/chat/chat-persist-interaction',
  '/api/chat/chat-session-metrics',
  '/api/search/search-context',
  '/api/batch/batch-register-chatid',
];

// Explicit list of routes that are always exempt (even if they match above).
// chat-init must be exempt because it initializes the visitorId.
const FINGERPRINT_EXEMPT_PATHS = [
  '/api/chat/chat-init',
];

/**
 * Checks if the URL matches any path in the given list.
 * Uses includes() for flexibility with query strings.
 */
function matchesPath(url, paths) {
  return paths.some(path => url.includes(path));
}

export default function botFingerprintPresence(req, res, next) {
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

    // 5. Validate visitorId is present in session
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
