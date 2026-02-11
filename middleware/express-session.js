import session from 'express-session';
import MongoStore from 'connect-mongo';
import { RedisStore } from 'connect-redis';
import { createClient } from 'redis';
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

const _getSessionMaxAgeMs = () => {
  const minutes = Number(_getSetting(['session.defaultTTLMinutes', 'SESSION_TTL_MINUTES']) || process.env.SESSION_TTL_MINUTES || '60');
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 60) * 60 * 1000;
};

// Singleton session middleware instance
let instance = null;

const buildSessionMiddleware = (app) => {
  const sessionType = (String(_getSetting(['session.type', 'SESSION_TYPE']) || process.env.SESSION_TYPE || process.env.SESSION_STORE || 'mongo')).toLowerCase();
  const sessionSecret = _getSetting(['session.secret', 'SESSION_SECRET']) || process.env.SESSION_SECRET || 'change-me-session-secret';

  let sessionStore = null;

  if (sessionType === 'redis') {
    const redisUrl = _getSetting(['redis.url', 'REDIS_URL']) || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    console.log(`[SESSION] Connecting to Redis at: ${redisUrl}`);
    const redisClient = createClient({ url: redisUrl });
    redisClient.on('error', (err) => console.error('[SESSION] Redis error:', err));
    redisClient.connect().catch(console.error);

    sessionStore = new RedisStore({
      client: redisClient,
      prefix: 'aianswers:sess:',
      disableTouch: false,
    });
  } else if (sessionType === 'mongodb' || sessionType === 'mongo') {
    sessionStore = MongoStore.create({
      clientPromise: dbConnect().then((m) => m.connection.getClient()),
      collectionName: 'sessions',
      touchAfter: 0,
    });
  } else {
    sessionStore = new session.MemoryStore();
  }

  app.set('trust proxy', 1);

  const isSecure = (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test');

  return session({
    name: 'aianswers.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: true,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'strict' : 'lax',
      maxAge: _getSessionMaxAgeMs(),
      path: '/'
    },
    rolling: true
  });
};

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
    if (!instance) {
      instance = buildSessionMiddleware(app);
    }

    const parentDomain = getParentDomain(req && req.get ? req.get('host') : undefined);
    applyParentDomainToCookieHeaders(res, parentDomain);

    instance(req, res, () => {
      if (req.session && req.session.cookie) {
        req.session.cookie.maxAge = _getSessionMaxAgeMs();

        if (parentDomain) {
          req.session.cookie.domain = parentDomain;
        }
      }
      next();
    });
  };
}
