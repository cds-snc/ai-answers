import session from 'express-session';
import MongoStore from 'connect-mongo';
import { SettingsService } from '../services/SettingsService.js';
import { getParentDomain } from '../api/util/cookie-utils.js';

const _getSetting = (keys) => {
  for (const k of keys) {
    const v = SettingsService.get(k);
    if (typeof v !== 'undefined' && v !== null && v !== '') return v;
  }
  return undefined;
};

export default function createSessionMiddleware(app) {
  const sessionType = (String(_getSetting(['session.type', 'SESSION_TYPE']) || process.env.SESSION_TYPE || process.env.SESSION_STORE || 'memory')).toLowerCase();
  const sessionSecret = _getSetting(['session.secret', 'SESSION_SECRET']) || process.env.SESSION_SECRET || 'change-me-session-secret';

  const initialTTLSetting = _getSetting(['session.defaultTTLMinutes', 'SESSION_TTL_MINUTES']) || process.env.SESSION_TTL_MINUTES || '10';
  const parsedInitialMinutes = Number(initialTTLSetting);
  const initialMinutes = Number.isFinite(parsedInitialMinutes) && parsedInitialMinutes > 0 ? parsedInitialMinutes : 60;
  const INITIAL_MAX_AGE = initialMinutes * 60 * 1000;

  let sessionStore = null;
  if (sessionType === 'mongodb' || sessionType === 'mongo') {
    const mongoUrl = _getSetting(['mongo.uri', 'MONGODB_URI']) || process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/ai-answers';
    sessionStore = MongoStore.create({ mongoUrl, collectionName: 'sessions' });
  } else {
    sessionStore = new session.MemoryStore();
  }

  if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  const baseUrl = (SettingsService.get('site.baseUrl') || process.env.BASE_URL || '').toString().trim();
  let parentDomain;
  try {
    let hostCandidate = baseUrl;
    if (baseUrl) {
      try {
        const u = new URL(baseUrl);
        hostCandidate = u.host;
      } catch (e) {
        hostCandidate = baseUrl.split('/')[0];
      }
    }
    parentDomain = getParentDomain(hostCandidate, process.env.NODE_ENV);
  } catch (e) {
    parentDomain = undefined;
  }

  const isSecure = process.env.NODE_ENV !== 'development';
  const cookieDefaults = {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'strict' : 'lax',
    maxAge: INITIAL_MAX_AGE,
    path: '/'
  };
  if (parentDomain) cookieDefaults.domain = parentDomain;

  const sessionMiddleware = session({
    name: 'aianswers.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: cookieDefaults
  });

  const wrapped = (req, res, next) => {
    sessionMiddleware(req, res, (err) => {
      if (err) return next(err);
      try {
        const sessionTTLSetting = _getSetting(['session.defaultTTLMinutes', 'SESSION_TTL_MINUTES']) || process.env.SESSION_TTL_MINUTES || '10';
        const parsedMinutes = Number(sessionTTLSetting);
        const sessionMinutes = Number.isFinite(parsedMinutes) && parsedMinutes > 0 ? parsedMinutes : 60;
        const MAX_AGE = sessionMinutes * 60 * 1000;

        const authTTLSetting = _getSetting(['session.authenticatedTTLMinutes', 'SESSION_AUTH_TTL_MINUTES']) || process.env.SESSION_AUTH_TTL_MINUTES || sessionTTLSetting;
        const parsedAuthMinutes = Number(authTTLSetting);
        const authMinutes = Number.isFinite(parsedAuthMinutes) && parsedAuthMinutes > 0 ? parsedAuthMinutes : sessionMinutes;
        const AUTH_MAX_AGE = authMinutes * 60 * 1000;

        const isAuthenticated = Boolean(
          req.user ||
          (req.session && (req.session.user || req.session.userId || req.session.authenticated || req.session.isAuthenticated))
        );

        if (req.session && req.session.cookie) {
          req.session.cookie.maxAge = isAuthenticated ? AUTH_MAX_AGE : MAX_AGE;
        }
      } catch (e) {
      }
      next();
    });
  };

  return wrapped;
}
