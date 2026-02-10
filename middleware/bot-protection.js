/**
 * Unified bot protection middleware for anonymous chat endpoints.
 * Combines fingerprint validation, isbot UA check, and optional bot-detector.
 * 
 * Skips all checks for authenticated users (they've already proven identity).
 * Should be applied at route-level, not app-level.
 */
import crypto from 'crypto';
import isbot from 'isbot';

const FP_PEPPER = process.env.FP_PEPPER || 'dev-pepper';

// ─────────────────────────────────────────────────────────────────────────────
// Bot Detector (lazy-loaded)
// ─────────────────────────────────────────────────────────────────────────────

let Detector = null;

async function loadDetector() {
  if (Detector !== null) return Detector;
  try {
    const mod = await import('bot-detector');
    Detector = mod?.default || mod;
  } catch {
    Detector = false;
  }
  return Detector;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function getClientIP(req) {
  if (!req) return '';
  if (req.ip) return req.ip;
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0]?.trim() || '';
  return req.connection?.remoteAddress || '';
}

function sendBotError(res, message) {
  res.statusCode = 403;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({ error: 'botDetected', message }));
}

function hashFingerprint(visitorId) {
  return crypto.createHmac('sha256', FP_PEPPER)
    .update(String(visitorId))
    .digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// Check Functions (each returns { blocked: boolean, message?: string })
// ─────────────────────────────────────────────────────────────────────────────

function checkSession(req) {
  if (!req.session) {
    return { blocked: true, message: 'Session required' };
  }
  return { blocked: false };
}

function checkIsBot(req) {
  const ua = req.headers?.['user-agent'] || '';
  if (ua && isbot(ua)) {
    return { blocked: true, message: 'Bot User-Agent detected' };
  }
  return { blocked: false };
}

async function checkBotDetector(req) {
  const detector = await loadDetector();
  if (!detector || typeof detector !== 'function') {
    return { blocked: false };
  }

  const ua = req.headers?.['user-agent'] || '';
  const ip = getClientIP(req);

  try {
    if (detector(ua, { ip })) {
      return { blocked: true, message: 'Bot detected' };
    }
  } catch {
    // Detection failed - allow through
  }
  return { blocked: false };
}

function checkFingerprint(req) {
  // Try to extract visitorId from request body
  const visitorId = req.body?.visitorId || req.body?.input?.visitorId;

  console.log('[checkFingerprint] sessionID:', req.sessionID, 'existing visitorId:', !!req.session?.visitorId, 'body visitorId:', !!visitorId);

  // Lazy init: hash and store fingerprint if provided
  if (!req.session.visitorId && visitorId) {
    req.session.visitorId = hashFingerprint(visitorId);
    console.log('[checkFingerprint] SET visitorId in session');
  }

  if (!req.session.visitorId) {
    console.log('[checkFingerprint] BLOCKED - no visitorId in session');
    return { blocked: true, message: 'Fingerprint required' };
  }
  return { blocked: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HOF wrapper: withBotProtection
 * Protects anonymous users from bot abuse on chat endpoints.
 * 
 * Checks performed (in order):
 * 1. Skip if authenticated (req.user exists)
 * 2. Validate session exists
 * 3. Check User-Agent against isbot
 * 4. Check User-Agent + IP against bot-detector
 * 5. Validate/init fingerprint in session
 * 
 * @param {Function} handler - The route handler to wrap
 * @returns {Function} Wrapped handler with bot protection
 */
export function withBotProtection(handler) {
  return async function botProtectionMiddleware(req, res) {
    try {
      // Authenticated users bypass all bot checks
      if (req.user) {
        return handler(req, res);
      }

      const isTestEnv = process.env.NODE_ENV === 'test';

      // Run checks in order
      const checks = [
        { name: 'No Session', fn: () => checkSession(req) },
        { name: 'isbot', fn: () => checkIsBot(req), skipInTest: true },
        { name: 'bot-detector', fn: () => checkBotDetector(req), skipInTest: true },
        { name: 'No Fingerprint', fn: () => checkFingerprint(req) },
      ];

      for (const check of checks) {
        if (isTestEnv && check.skipInTest) continue;

        const result = await check.fn();
        if (result.blocked) {
          console.log(`[botProtection] BLOCKED (${check.name})`);
          return sendBotError(res, result.message);
        }
      }

      // All checks passed
      return handler(req, res);
    } catch (e) {
      console.error('withBotProtection error', e);
      if (!res.headersSent) {
        res.status(500).json({ error: 'server_error' });
      }
    }
  };
}

export default withBotProtection;
