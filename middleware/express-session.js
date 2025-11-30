import session from 'express-session';
import MongoStore from 'connect-mongo';
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

// Internal reset hook
let internalResetFn = async () => {};

// Allow external trigger to rebuild store
export async function resetSessionMiddleware() {
  return internalResetFn();
}

export default function createSessionMiddleware(app) {
  let currentConfig = null;
  let sessionMiddleware = null;

  const buildConfigFromSettings = () => {
    const sessionType =
      (String(
        _getSetting(['session.type', 'SESSION_TYPE']) ||
        process.env.SESSION_TYPE ||
        process.env.SESSION_STORE ||
        'mongo'
      )).toLowerCase();

    const sessionSecret =
      _getSetting(['session.secret', 'SESSION_SECRET']) ||
      process.env.SESSION_SECRET ||
      'change-me-session-secret';

    const initialTTLSetting =
      _getSetting(['session.defaultTTLMinutes', 'SESSION_TTL_MINUTES']) ||
      process.env.SESSION_TTL_MINUTES ||
      '10';

    const parsedInitialMinutes = Number(initialTTLSetting);
    const initialMinutes = Number.isFinite(parsedInitialMinutes) && parsedInitialMinutes > 0
      ? parsedInitialMinutes
      : 60;

    const authTTLSetting =
      _getSetting(['session.authenticatedTTLMinutes', 'SESSION_AUTH_TTL_MINUTES']) ||
      process.env.SESSION_AUTH_TTL_MINUTES ||
      initialTTLSetting;

    const mongoUrl =
      _getSetting(['mongo.uri', 'MONGODB_URI']) ||
      process.env.MONGODB_URI ||
      process.env.MONGO_URL ||
      'mongodb://localhost:27017/ai-answers';

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

    //
    // ❗ FIXED — Use mongoUrl (NOT clientPromise)
    // this guarantees stable initialization and avoids Lambda race conditions
    //
    if (cfg.sessionType === 'mongodb' || cfg.sessionType === 'mongo') {
      sessionStore = MongoStore.create({
        mongoUrl: cfg.mongoUrl,
        collectionName: 'sessions',
        touchAfter: 0, // disable lazy writes (critical fix!)
      });
    } else {
      sessionStore = new session.MemoryStore();
    }

    //
    // Lambda + reverse proxy support
    //
    app.set('trust proxy', 1);

    const isSecure = process.env.NODE_ENV !== 'development';
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

  //
  // Only rebuild when config actually changes
  //
  const ensureSessionUpToDate = async () => {
    try {
      const cfg = buildConfigFromSettings();
      const needsRebuild =
        !currentConfig ||
        cfg.sessionType !== currentConfig.sessionType ||
        cfg.sessionSecret !== currentConfig.sessionSecret ||
        cfg.initialMinutes !== currentConfig.initialMinutes ||
        cfg.authTTLSetting !== currentConfig.authTTLSetting ||
        cfg.mongoUrl !== currentConfig.mongoUrl;

      if (needsRebuild) {
        sessionMiddleware = buildSessionMiddleware(cfg);
        currentConfig = cfg;
      }
    } catch (e) {
      // Do not block request on config errors
    }
  };

  //
  // Reset hook: forces rebuild
  //
  internalResetFn = async () => {
    const cfg = buildConfigFromSettings();
    sessionMiddleware = buildSessionMiddleware(cfg);
    currentConfig = cfg;
  };

  //
  // Initial build
  //
  try {
    const cfg = buildConfigFromSettings();
    sessionMiddleware = buildSessionMiddleware(cfg);
    currentConfig = cfg;
  } catch (e) {
    sessionMiddleware = (req, res, next) => next();
  }

  //
  // Main wrapper
  //
  const wrapped = (req, res, next) => {
    Promise.resolve(ensureSessionUpToDate()).then(() => {
      sessionMiddleware(req, res, (err) => {
        if (err) return next(err);

        try {
          const sessionTTLSetting =
            _getSetting(['session.defaultTTLMinutes', 'SESSION_TTL_MINUTES']) ||
            process.env.SESSION_TTL_MINUTES ||
            '10';

          const parsedMinutes = Number(sessionTTLSetting);
          const sessionMinutes =
            Number.isFinite(parsedMinutes) && parsedMinutes > 0
              ? parsedMinutes
              : 60;

          const MAX_AGE = sessionMinutes * 60 * 1000;

          const authTTLSetting =
            _getSetting([
              'session.authenticatedTTLMinutes',
              'SESSION_AUTH_TTL_MINUTES'
            ]) ||
            process.env.SESSION_AUTH_TTL_MINUTES ||
            sessionTTLSetting;

          const parsedAuthMinutes = Number(authTTLSetting);
          const authMinutes =
            Number.isFinite(parsedAuthMinutes) && parsedAuthMinutes > 0
              ? parsedAuthMinutes
              : sessionMinutes;

          const AUTH_MAX_AGE = authMinutes * 60 * 1000;

          //
          // Apply dynamic cookie rules
          //
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
              const dynamicDomain = getParentDomain(
                requestHost,
                process.env.NODE_ENV
              );

              if (dynamicDomain) {
                req.session.cookie.domain = dynamicDomain;
              } else {
                delete req.session.cookie.domain;
              }
            }
          };

          applyDynamicSessionSettings();

          //
          // Ensure cookie settings survive session regeneration
          //
          const originalEnd = res.end;
          res.end = function (...args) {
            try {
              applyDynamicSessionSettings();
            } catch (e) {}
            return originalEnd.apply(this, args);
          };

        } catch (e) {
          // continue regardless
        }

        next();
      });
    }).catch(() => {
      // fail open
      sessionMiddleware(req, res, next);
    });
  };

  return wrapped;
}
