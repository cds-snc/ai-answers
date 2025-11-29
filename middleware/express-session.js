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

// Internal reset hook (will be set when middleware initializes)
let internalResetFn = async () => {};

// Exported helper to force a reset from other modules (admin endpoint/tests)
export async function resetSessionMiddleware() {
  return internalResetFn();
}

export default function createSessionMiddleware(app) {
  // Track current configuration so we can hot-swap when settings change
  let currentConfig = null;

  // sessionMiddleware is referenced by the request wrapper and can be swapped
  // when settings change.
  let sessionMiddleware = null;

  const buildConfigFromSettings = () => {
    const sessionType = (String(_getSetting(['session.type', 'SESSION_TYPE']) || process.env.SESSION_TYPE || process.env.SESSION_STORE || 'memory')).toLowerCase();
    const sessionSecret = _getSetting(['session.secret', 'SESSION_SECRET']) || process.env.SESSION_SECRET || 'change-me-session-secret';

    const initialTTLSetting = _getSetting(['session.defaultTTLMinutes', 'SESSION_TTL_MINUTES']) || process.env.SESSION_TTL_MINUTES || '10';
    const parsedInitialMinutes = Number(initialTTLSetting);
    const initialMinutes = Number.isFinite(parsedInitialMinutes) && parsedInitialMinutes > 0 ? parsedInitialMinutes : 60;

    const authTTLSetting = _getSetting(['session.authenticatedTTLMinutes', 'SESSION_AUTH_TTL_MINUTES']) || process.env.SESSION_AUTH_TTL_MINUTES || initialTTLSetting;

    const mongoUrl = _getSetting(['mongo.uri', 'MONGODB_URI']) || process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/ai-answers';

    return {
      sessionType,
      sessionSecret,
      initialMinutes,
      authTTLSetting,
      mongoUrl
    };
  };

  const buildSessionMiddleware = (cfg) => {
    let sessionStore = null;
    if (cfg.sessionType === 'mongodb' || cfg.sessionType === 'mongo') {
      sessionStore = MongoStore.create({ mongoUrl: cfg.mongoUrl, collectionName: 'sessions' });
    } else {
      sessionStore = new session.MemoryStore();
    }

      app.set('trust proxy', 1);
   
    // We no longer set a static domain here based on baseUrl.
    // Instead, we determine the domain dynamically in the request wrapper.

    const isSecure = false; //process.env.NODE_ENV !== 'development';
    const INITIAL_MAX_AGE = cfg.initialMinutes * 60 * 1000;
    const cookieDefaults = {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'strict' : 'lax',
      maxAge: INITIAL_MAX_AGE,
      path: '/'
    };

    return session({
      name: 'aianswers.sid',
      secret: cfg.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: cookieDefaults
    });
  };

  // Helper to get settings and determine if we need to rebuild
  const ensureSessionUpToDate = async () => {
    try {
      const cfg = buildConfigFromSettings();
      const needsRebuild = !currentConfig ||
        cfg.sessionType !== currentConfig.sessionType ||
        cfg.sessionSecret !== currentConfig.sessionSecret ||
        cfg.initialMinutes !== currentConfig.initialMinutes ||
        cfg.authTTLSetting !== currentConfig.authTTLSetting ||
        cfg.mongoUrl !== currentConfig.mongoUrl;

      if (needsRebuild) {
        // Rebuild and atomically swap
        sessionMiddleware = buildSessionMiddleware(cfg);
        currentConfig = cfg;
      }
    } catch (e) {
      // Don't block requests if the dynamic check fails; keep using existing middleware
    }
  };

  // Assign internal reset hook so other modules can trigger rebuilds
  internalResetFn = async () => {
    const cfg = buildConfigFromSettings();
    sessionMiddleware = buildSessionMiddleware(cfg);
    currentConfig = cfg;
  };

  // Initialize once synchronously
  try {
    const cfg = buildConfigFromSettings();
    sessionMiddleware = buildSessionMiddleware(cfg);
    currentConfig = cfg;
  } catch (e) {
    // If initial build failed, ensure we have a no-op middleware that forwards
    sessionMiddleware = (req, res, next) => next();
  }

  const wrapped = (req, res, next) => {
    // Ensure any config changes are picked up before handling the request
    Promise.resolve(ensureSessionUpToDate()).then(() => {
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

          // Define helper to apply dynamic domain and TTL
          // We need this because req.login() (Passport) regenerates the session,
          // which resets the cookie options. We must re-apply our dynamic settings
          // just before the response is sent (when the session is saved).
          const applyDynamicSessionSettings = () => {
            if (!req.session || !req.session.cookie) return;

            const isAuth = Boolean(
              req.user ||
              (req.session && (
                (req.session.passport && req.session.passport.user) ||
                req.session.user ||
                req.session.userId ||
                req.session.authenticated ||
                req.session.isAuthenticated
              ))
            );

            req.session.cookie.maxAge = isAuth ? AUTH_MAX_AGE : MAX_AGE;

            const requestHost = req.get('host');
            if (requestHost) {
              const dynamicDomain = getParentDomain(requestHost, process.env.NODE_ENV);
              if (dynamicDomain) {
                req.session.cookie.domain = dynamicDomain;
              } else {
                delete req.session.cookie.domain;
              }
            }
          };

          // Apply immediately for the current session
          applyDynamicSessionSettings();

          // Hook into res.end to ensure settings are applied even if session was regenerated
          const originalEnd = res.end;
          res.end = function(...args) {
            try {
              applyDynamicSessionSettings();
            } catch (e) {
              // ignore errors during patch
            }
            return originalEnd.apply(this, args);
          };

        } catch (e) {
        }
        next();
      });
    }).catch(() => {
      // If the ensure check fails, proceed with existing middleware
      sessionMiddleware(req, res, next);
    });
  };

  return wrapped;
}
