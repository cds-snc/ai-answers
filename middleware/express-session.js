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

  const sessionTTLSetting = _getSetting(['session.defaultTTLMinutes', 'SESSION_TTL_MINUTES']) || process.env.SESSION_TTL_MINUTES || '60';
  const parsedMinutes = Number(sessionTTLSetting);
  const sessionMinutes = Number.isFinite(parsedMinutes) && parsedMinutes > 0 ? parsedMinutes : 60;
  const MAX_AGE = sessionMinutes * 60 * 1000;

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

  // Compute cookie options from settings (Base URL) and environment.
  const baseUrl = (SettingsService.get('site.baseUrl') || process.env.BASE_URL || '').toString().trim();
  let parentDomain;
  try {
    let hostCandidate = baseUrl;
    if (baseUrl) {
      try {
        const u = new URL(baseUrl);
        hostCandidate = u.host;
      } catch (e) {
        // baseUrl may already be a host; fall back to raw value
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
    maxAge: MAX_AGE,
    path: '/'
  };
  if (parentDomain) cookieDefaults.domain = parentDomain;

  // Create the session middleware with computed cookie defaults
  const sessionMiddleware = session({
    name: 'aianswers.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: cookieDefaults
  });

  return sessionMiddleware;
}
