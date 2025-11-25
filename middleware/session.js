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
      const isSecure = process.env.NODE_ENV !== 'development';
      const sameSite = isSecure ? 'strict' : 'lax';
      const cookies = parseCookies(req.headers?.cookie || '');

      // chatId is now generated and managed server-side only
      // No longer accept client-provided chatId for security

      // Compute HMACed fingerprint key early so it can be passed to any
      // SessionManagementService.register call (new or existing sessions).
      const fingerprintHeader = (req.headers['x-fp-id'] || '').toString();
      const fingerprintKey = fingerprintHeader
        ? crypto.createHmac('sha256', fingerprintPepper).update(fingerprintHeader).digest('hex')
        : null;

      let sessionId = null;
      const sessionToken = cookies[SESSION_COOKIE_NAME];
      if (sessionToken) {
        try {
          const decodedSession = jwt.verify(sessionToken, secretKey) || {};
          sessionId = decodedSession.jti || decodedSession.jwtid || null;
        } catch (err) {
          sessionId = null;
        }
      }

      let sessionInfo = sessionId ? SessionManagementService.getInfo(sessionId) : null;

      if (sessionId && !sessionInfo) {
        if (!SessionManagementService.hasCapacity()) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'noSessionCapacity' }));
        }

        // Pass fingerprintKey when registering an existing-but-unknown session
        // so the session manager can map any provided fingerprint to the session.
        const isAuthenticated = !!req.user;
        const reg = await SessionManagementService.register(sessionId, { fingerprintKey, isAuthenticated });
        if (!reg.ok) {
          if (reg.reason === 'capacity') {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'noSessionCapacity' }));
          }
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'couldNotRegister' }));
        }
        sessionInfo = reg.session || SessionManagementService.getInfo(sessionId);
      }

      if (!sessionId) {
        if (!SessionManagementService.hasCapacity()) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'noSessionCapacity' }));
        }
        // Verify server-signed fingerprint cookie (if present) to avoid counting unverified headers
        let fingerprintVerified = false;
        try {
          const fpSigned = cookies['fpSigned'];
          if (fpSigned) {
            const decoded = jwt.verify(fpSigned, secretKey) || {};
            // token payload should contain fp (raw header) and issuedAt
            if (decoded && decoded.fp && decoded.fp === fingerprintHeader) {
              fingerprintVerified = true;
            }
          }
        } catch (e) {
          // invalid signature or decode error => not verified
          fingerprintVerified = false;
        }

        // Generate both sessionId and chatId server-side
        // The chatId is created here and associated with the session
        sessionId = uuidv4();
        const chatId = uuidv4(); // Server-generated chatId
        const isAuthenticated = !!req.user;
        const reg = await SessionManagementService.register(sessionId, { chatId, fingerprintKey, isAuthenticated });
        if (!reg.ok) {
          if (reg.reason === 'capacity') {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'noSessionCapacity' }));
          }
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'couldNotRegister' }));
        }
        sessionInfo = reg.session || SessionManagementService.getInfo(sessionId);

        // Read dynamic session TTL from settings (minutes) if available.
        let sessionTtlSeconds = SESSION_TTL_SECONDS;
        try {
          const ttlMinutes = await SettingsService.get('session.defaultTTLMinutes');
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
      } else if (sessionId) {
        // existing session: update lastSeen and ensure any provided chatId
        // is associated with the session. This ensures multiple tabs (chatIds)
        // are tracked under the same session and will show up in the admin UI.

        // Bot detection: If we have a sessionId (from cookie) but no fingerprint,
        // this indicates a bot that accepts cookies but doesn't execute JavaScript
        // to generate the fingerprint. Block these requests.
        if (!fingerprintHeader) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'botDetected', message: 'Fingerprint required for existing sessions' }));
        }

       
        try {
          // register will update ttl/lastSeen for existing session
          const isAuthenticated = !!req.user;
          await SessionManagementService.register(sessionId, { chatId, fingerprintKey, isAuthenticated });
        } catch (e) {
          // fall back to touch on any failure to avoid blocking requests
          SessionManagementService.touch(sessionId);
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
        return next();
      }

      const allowed = SessionManagementService.canConsume(sessionId, 1);
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


      // Validate chatId from request body if provided
      // Endpoints can access validated chatId via req.chatId
      let chatId = null;

      // Check body (POST/PUT) or query params (GET)
      const requestChatId = req.body?.chatId || req.query?.chatId;

      if (requestChatId) {
        // Validate that chatId belongs to this session
        if (sessionInfo?.chatIds && sessionInfo.chatIds.includes(requestChatId)) {
          chatId = requestChatId;
        } else {
          // ChatId provided but doesn't belong to session - reject request
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'invalid_chatId', message: 'ChatId does not belong to session' }));
        }
      }

      req.sessionId = sessionId;
      req.session = sessionInfo || SessionManagementService.getInfo(sessionId);
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

