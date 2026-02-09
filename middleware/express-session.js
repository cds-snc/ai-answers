import session from 'express-session';
import MongoStore from 'connect-mongo';
import { RedisStore } from 'connect-redis';
import Redis from 'ioredis';
import { SettingsService } from '../services/SettingsService.js';
import { getParentDomain } from '../api/util/cookie-utils.js';
import dbConnect from '../api/db/db-connect.js';

const _getSetting = (keys) => {
  for (const k of keys) {
    const v = SettingsService.get(k);
    if (typeof v !== 'undefined' && v !== null && v !== '') return v;
  }
  return undefined;
};

// Singleton session middleware instance
let instance = null;

/**
 * Builds the session middleware once.
 * Configuration is primarily from SettingsService, falling back to process.env.
 */
const buildSessionMiddleware = (app) => {
  const sessionType = (String(_getSetting(['session.type', 'SESSION_TYPE']) || process.env.SESSION_TYPE || process.env.SESSION_STORE || 'memory')).toLowerCase();
  const sessionSecret = _getSetting(['session.secret', 'SESSION_SECRET']) || process.env.SESSION_SECRET || 'change-me-session-secret';

  const initialTTLSetting = _getSetting(['session.defaultTTLMinutes', 'SESSION_TTL_MINUTES']) || process.env.SESSION_TTL_MINUTES || '10';
  const parsedInitialMinutes = Number(initialTTLSetting);
  const initialMinutes = Number.isFinite(parsedInitialMinutes) && parsedInitialMinutes > 0 ? parsedInitialMinutes : 60;

  let sessionStore = null;

  console.log(`[SESSION] Initializing session store: ${sessionType}`);

  if (sessionType === 'redis') {
    const redisUrl = _getSetting(['redis.url', 'REDIS_URL']) || process.env.REDIS_URL || 'redis://localhost:6379';
    const redisClient = new Redis(redisUrl);

    redisClient.on('error', (err) => console.error('[SESSION] Redis error:', err));
    redisClient.on('connect', () => console.log('[SESSION] Redis connected'));

    sessionStore = new RedisStore({
      client: redisClient,
      prefix: 'aianswers:sess:',
    });
  } else if (sessionType === 'mongodb' || sessionType === 'mongo') {
    sessionStore = MongoStore.create({
      clientPromise: dbConnect().then((m) => m.connection.getClient()),
      collectionName: 'sessions',
      touchAfter: 0,
    });
  } else {
    console.warn(`[SESSION] Using MemoryStore. Sessions will NOT persist between server restarts.`);
    sessionStore = new session.MemoryStore();
  }

  app.set('trust proxy', 1);

  const isSecure = (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test');
  const INITIAL_MAX_AGE = initialMinutes * 60 * 1000;

  const cookieDefaults = {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'strict' : 'lax',
    maxAge: INITIAL_MAX_AGE,
    path: '/'
  };

  return session({
    name: 'aianswers.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: cookieDefaults,
    rolling: true
  });
};

/**
 * Creates or retrieves the session middleware.
 * Implements a wrapper that ensures the middleware is initialized only once,
 * picking up settings after the server has started.
 */
export default function createSessionMiddleware(app) {
  const applyParentDomainToCookieHeaders = (res, parentDomain) => {
    if (!parentDomain || typeof res.writeHead !== 'function' || res.__parentDomainCookieNormalized) return;
    res.__parentDomainCookieNormalized = true;
    const origWriteHead = res.writeHead.bind(res);

    const rewriteSetCookie = () => {
      try {
        const setCookieHeader = res.getHeader('Set-Cookie');
        if (!setCookieHeader) return;
        const cookies = Array.isArray(setCookieHeader) ? setCookieHeader.slice() : [String(setCookieHeader)];
        const lastIndexByName = {};
        cookies.forEach((cookie, index) => {
          const nameMatch = cookie.match(/^([^=;]+)=/);
          if (nameMatch) lastIndexByName[nameMatch[1]] = index;
        });
        const updated = cookies.map((cookie, index) => {
          if (!cookie.startsWith('aianswers.sid=')) return cookie;
          if (lastIndexByName['aianswers.sid'] !== index) return null;
          const withoutDomain = cookie.replace(/; *Domain=[^;]+/i, '');
          return withoutDomain + `; Domain=${parentDomain}`;
        }).filter(Boolean);
        if (updated.length) res.setHeader('Set-Cookie', updated);
      } catch (e) {
        // ignore normalization failures
      }
    };

    res.writeHead = function (...args) {
      rewriteSetCookie();
      return origWriteHead(...args);
    };
  };

  return (req, res, next) => {
    // Initialize singleton on first request to ensure SettingsService is ready
    if (!instance) {
      instance = buildSessionMiddleware(app);
    }

    const parentDomain = getParentDomain(req && req.get ? req.get('host') : undefined);
    applyParentDomainToCookieHeaders(res, parentDomain);

    instance(req, res, () => {
      try {
        if (req && req.session && req.session.cookie && parentDomain) {
          req.session.cookie.domain = parentDomain;
        }
      } catch (e) {
        // ignore set-domain failures
      }
      next();
    });
  };
}
