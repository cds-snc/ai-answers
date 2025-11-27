import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import SessionManagementService from '../services/SessionManagementService.js';
import { SettingsService } from '../services/SettingsService.js';
import { getParentDomain } from '../api/util/cookie-utils.js';

const secretKey = process.env.JWT_SECRET_KEY || 'dev-secret';
const fingerprintPepper = process.env.FP_PEPPER || 'dev-pepper';
const SESSION_COOKIE_NAME = 'sessionToken';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // default 30 days fallback

// Express/Next.js style middleware
export default function sessionMiddleware(options = {}) {
  return async function (req, res, next) {
    try {
      // Check if session management is enabled
      if (!SessionManagementService.isManagementEnabled()) {
        // Bypass all session management when disabled
        req.chatId = req.body?.chatId;
        return next();
      }

      const isSecure = process.env.NODE_ENV !== 'development';
      const sameSite = isSecure ? 'strict' : 'lax';
      const cookies = parseCookies(req.headers?.cookie || '');

      // chatId is now generated and managed server-side only
      // No longer accept client-provided chatId for security

      // Do not extract incoming chatId here; read it only at validation time
      // to avoid carrying client-provided values into registration paths.

      // Compute HMACed fingerprint key early so it can be passed to any
      // SessionManagementService.register call (new or existing sessions).
      const fingerprintHeader = (req.headers['x-fp-id'] || '').toString();
      const fingerprintKey = fingerprintHeader
        ? crypto.createHmac('sha256', fingerprintPepper).update(fingerprintHeader).digest('hex')
        : null;

      // Helpers: extract session id from cookie token
      function extractSessionIdFromCookie(token) {
        if (!token) return null;
        try {
          const decoded = jwt.verify(token, secretKey) || {};
          return decoded.jti || decoded.jwtid || null;
        } catch (e) {
          return null;
        }
      }

      function verifyFpSignedCookie(cookies, fingerprintHeader) {
        try {
          const fpSigned = cookies['fpSigned'];
          if (!fpSigned) return false;
          const decoded = jwt.verify(fpSigned, secretKey) || {};
          if (decoded && decoded.fp && decoded.fp === fingerprintHeader) return true;
        } catch (e) {
          return false;
        }
        return false;
      }

      async function rehydrateOrRegister(sessionId, { fingerprintHeader, fingerprintKey, fingerprintVerified, isAuthenticated }) {
        // Try to read existing in-memory info first
        let info = sessionId ? await SessionManagementService.getInfo(sessionId) : null;
        if (info) return { ok: true, session: info };

        // Require a verified fingerprint or raw header for resurrect/register path
        if (!fingerprintHeader && !fingerprintVerified) {
          return { ok: false, reason: 'botDetected' };
        }

        // Delegate capacity and creation logic to SessionManagementService.register
        const reg = await SessionManagementService.register(sessionId, { fingerprintKey, isAuthenticated });
        if (!reg.ok) return reg;
        return { ok: true, session: reg.session };
      }

      async function createNewSession({ fingerprintHeader, fingerprintKey, fingerprintVerified, isAuthenticated }) {
        // If no fingerprint exists we may still allow creation, but SessionManagementService
        // expects a verified fingerprintKey. Let register decide and return its result
        const sid = uuidv4();
        const chatId = uuidv4();
        const reg = await SessionManagementService.register(sid, { chatId, fingerprintKey, isAuthenticated, generateChatId: false });
        if (!reg.ok) return { ok: false, reason: reg.reason };
        return { ok: true, sessionId: sid, session: reg.session };
      }

      let sessionId = extractSessionIdFromCookie(cookies[SESSION_COOKIE_NAME]);
      let sessionInfo = sessionId ? await SessionManagementService.getInfo(sessionId) : null;

      // Verify server-signed fingerprint cookie (if present) to avoid counting unverified headers
      const fingerprintVerified = verifyFpSignedCookie(cookies, fingerprintHeader);

      // If we have an active session object already, require fingerprint header
      // for subsequent requests and attempt to refresh registration (touch).
      if (sessionId && sessionInfo) {
        if (!fingerprintHeader) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'botDetected', message: 'Fingerprint required for existing sessions' }));
        }

        try {
          const isAuthenticated = !!req.user;
          await SessionManagementService.register(sessionId, { fingerprintKey, isAuthenticated });
        } catch (e) {
          await SessionManagementService.touch(sessionId);
        }
      }

      // Additional bot detection: If this is the second+ request and we still don't have
      // a sessionToken cookie, the client isn't storing cookies (likely a bot).
      // We detect this by checking if fpSigned cookie exists but sessionToken doesn't.
      if (!sessionId && cookies['fpSigned']) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'botDetected', message: 'Session cookie required' }));
      }

      if (!sessionId) {
        // No session cookie: create a new session (delegates capacity checks to register)
        const isAuthenticated = !!req.user;
        const created = await createNewSession({ fingerprintHeader, fingerprintKey, fingerprintVerified, isAuthenticated });
        if (!created.ok) {
          if (created.reason === 'capacity') {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'noSessionCapacity' }));
          }
          // If fingerprint was required by register but missing, treat as bot-like
          if (created.reason === 'fingerprintRequired') {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'botDetected', message: 'Fingerprint required' }));
          }
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'couldNotRegister' }));
        }

        // persist session values locally for downstream handlers and set cookies
        sessionId = created.sessionId;
        sessionInfo = created.session || await SessionManagementService.getInfo(sessionId);

        // Read dynamic session TTL from settings (minutes) if available.
        let sessionTtlSeconds = SESSION_TTL_SECONDS;
        try {
          const ttlMinutes = SettingsService.get('session.defaultTTLMinutes');
          const ttlNum = Number(ttlMinutes);
          if (!Number.isNaN(ttlNum) && ttlNum > 0) sessionTtlSeconds = Math.floor(ttlNum * 60);
        } catch (e) {
          // ignore and use fallback
        }

        const sessionJwt = jwt.sign({}, secretKey, { jwtid: sessionId, expiresIn: `${sessionTtlSeconds}s` });
        const secureFlag = isSecure ? 'Secure; ' : '';
        // Add Domain attribute when appropriate (non-development and multi-label host)
        const parentDomain = getParentDomain(req.get && req.get('host') ? req.get('host') : (req.headers && req.headers.host) || undefined);
        const domainAttr = parentDomain ? `Domain=${parentDomain}; ` : '';
        appendSetCookie(res, `${SESSION_COOKIE_NAME}=${sessionJwt}; HttpOnly; ${secureFlag}${domainAttr}SameSite=${sameSite}; Path=/; Max-Age=${sessionTtlSeconds}`);

        // If client provided a fingerprint header and it was not yet verified, issue a signed fp cookie
        try {
          if (fingerprintHeader && !fingerprintVerified) {
            const fpToken = jwt.sign({ fp: fingerprintHeader, iat: Math.floor(Date.now() / 1000) }, secretKey, { expiresIn: `${sessionTtlSeconds}s` });
            appendSetCookie(res, `fpSigned=${fpToken}; HttpOnly; ${secureFlag}${domainAttr}SameSite=${sameSite}; Path=/; Max-Age=${sessionTtlSeconds}`);
          }
        } catch (e) {
          // ignore cookie issuance failures
        }

        return next();
      }

      // If we have a session id but no in-memory session, attempt to rehydrate
      // or re-register. This avoids a race between getInfo() and capacity checks
      // by delegating capacity decisions to SessionManagementService.register.
      if (sessionId && !sessionInfo) {
        const isAuthenticated = !!req.user;
        const reg = await rehydrateOrRegister(sessionId, { fingerprintHeader, fingerprintKey, fingerprintVerified, isAuthenticated });
        if (!reg.ok) {
          if (reg.reason === 'capacity') {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'noSessionCapacity' }));
          }
          if (reg.reason === 'botDetected' || reg.reason === 'fingerprintRequired') {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'botDetected', message: 'Fingerprint required for existing sessions' }));
          }
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'couldNotRegister' }));
        }
        sessionInfo = reg.session || await SessionManagementService.getInfo(sessionId);
      }

      const allowed = await SessionManagementService.canConsume(sessionId, 1);
      if (!allowed.ok) {
        if (allowed.reason === 'noCredits') {
          res.statusCode = 429;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'noCredits' }));
        }
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'rateLimitExceeded' }));
      }


      // Validate chatId from request body if provided; expose validated
      // chatId via `req.chatId` for downstream handlers.
      let chatId = null;
      const incomingChatId = req.body?.chatId;
      if (incomingChatId) {
        if (sessionInfo?.chatIds && sessionInfo.chatIds.includes(incomingChatId)) {
          chatId = incomingChatId;
        } else {
          try {
            console.warn('[session] invalid_chatId', { pid: process.pid, sessionId, incomingChatId, sessionChatIds: sessionInfo?.chatIds });
          } catch (e) { /* best-effort logging */ }
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'invalid_chatId', message: 'ChatId does not belong to session' }));
        }
      }

      req.sessionId = sessionId;
      req.session = sessionInfo || await SessionManagementService.getInfo(sessionId);
      req.chatSession = req.session;
      req.fingerprintKey = fingerprintKey; // Expose for downstream handlers
      req.chatId = chatId;
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

function parseCookies(header) {
  return header
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) return acc;
      const key = pair.slice(0, eqIndex);
      const value = pair.slice(eqIndex + 1);
      acc[key] = value;
      return acc;
    }, {});
}

function appendSetCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', [cookie]);
    return;
  }
  if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, cookie]);
    return;
  }
  res.setHeader('Set-Cookie', [current, cookie]);
}

