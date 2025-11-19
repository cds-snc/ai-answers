import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import SessionManagementService from '../services/SessionManagementService.js';
import { SettingsService } from '../services/SettingsService.js';

const secretKey = process.env.JWT_SECRET_KEY || 'dev-secret';
const fingerprintPepper = process.env.FP_PEPPER || 'dev-pepper';
const CHAT_COOKIE_NAME = 'token';
const SESSION_COOKIE_NAME = 'sessionToken';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // default 30 days fallback

// Express/Next.js style middleware
export default function sessionMiddleware(options = {}) {
  return async function (req, res, next) {
    try {
      const cookies = parseCookies(req.headers?.cookie || '');

      // Preserve existing chat token behaviour for compatibility
      let chatId = null;
      const chatToken = cookies[CHAT_COOKIE_NAME];
      if (chatToken) {
        try {
          const decodedChat = jwt.decode(chatToken) || {};
          chatId = decodedChat.jti || decodedChat.jwtid || null;
        } catch (e) {
          // ignore malformed chat token
        }
      }

      if (!chatId) {
        chatId = req.query?.chatId || req.headers['x-chat-id'] || null;
      }
      if (chatId) req.chatId = chatId;

      // Compute HMACed fingerprint key early so it can be passed to any
      // SessionManagementService.register call (new or existing sessions).
      const fingerprintHeader = (req.headers['x-fp-hash'] || req.headers['x-fp-id'] || '').toString();
      const fingerprintKey = fingerprintHeader
        ? crypto.createHmac('sha256', fingerprintPepper).update(fingerprintHeader).digest('hex')
        : null;

      let sessionId = null;
      const sessionToken = cookies[SESSION_COOKIE_NAME] || req.headers['x-session-token'];
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
        const reg = await SessionManagementService.register(sessionId, { chatId, fingerprintKey });
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

        // Pass the HMACed fingerprintKey to the session manager so it can
        // map the fingerprint to the created session. If the client provided
        // a raw fingerprint header, we will still issue a signed `fpSigned`
        // cookie for stronger verification on subsequent requests.
        sessionId = uuidv4();
        const reg = await SessionManagementService.register(sessionId, { chatId, fingerprintKey });
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
        appendSetCookie(res, `${SESSION_COOKIE_NAME}=${sessionJwt}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${sessionTtlSeconds}`);

        // If client provided a fingerprint header and it was not yet verified, issue a signed fp cookie
        try {
          if (fingerprintHeader && !fingerprintVerified) {
            const fpToken = jwt.sign({ fp: fingerprintHeader, iat: Math.floor(Date.now() / 1000) }, secretKey, { expiresIn: `${sessionTtlSeconds}s` });
            appendSetCookie(res, `fpSigned=${fpToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${sessionTtlSeconds}`);
          }
        } catch (e) {
          // ignore cookie issuance failures
        }
      } else if (sessionId) {
        // existing session: update lastSeen and ensure any provided chatId
        // is associated with the session. This ensures multiple tabs (chatIds)
        // are tracked under the same session and will show up in the admin UI.
        try {
          // register will update ttl/lastSeen and add chatId to session.chatIds if provided
          await SessionManagementService.register(sessionId, { chatId, fingerprintKey });
        } catch (e) {
          // fall back to touch on any failure to avoid blocking requests
          SessionManagementService.touch(sessionId);
        }
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

      req.sessionId = sessionId;
      req.session = sessionInfo || SessionManagementService.getInfo(sessionId);
      req.chatSession = req.session;
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
      if (shouldBypassSession(req)) {
        return handler(req, res);
      }
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

function hasAdminBearerAuth(req) {
  try {
    const header = req?.headers?.authorization || req?.headers?.Authorization;
    if (!header || typeof header !== 'string') return false;
    const [scheme, token] = header.trim().split(/\s+/);
    if (!token || scheme.toLowerCase() !== 'bearer') return false;
    try {
      const decoded = jwt.verify(token, secretKey);
      return decoded && decoded.role === 'admin';
    } catch (e) {
      return false;
    }
  } catch (e) {
    return false;
  }
}

function shouldBypassSession(req) {
  try {
    const bypassHeader = req?.headers?.['x-session-bypass'];
    if (!hasAdminBearerAuth(req)) return false;
    if (typeof bypassHeader === 'string') {
      return bypassHeader === '1' || bypassHeader.toLowerCase() === 'true';
    }
    if (Array.isArray(bypassHeader)) {
      return bypassHeader.some((v) => typeof v === 'string' && (v === '1' || v.toLowerCase() === 'true'));
    }
  } catch (e) {
    // ignore and fall through to enforce session
  }
  return false;
}
