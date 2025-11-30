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

  // Track DB connect status so middleware can short-circuit requests
  // if the application DB fails to connect during startup.
  // Note: MongoStore uses `mongoUrl` (not the mongoose client), so
  // session store creation will still attempt to use the configured URL.
  // However we treat a failure to connect the app DB as a fatal startup
  // condition for incoming requests and return a clear 500 response.
  let dbConnectError = null;
  const dbConnectPromise = dbConnect().catch(err => {
    dbConnectError = err;
    console.error("[session] dbConnect() failed during startup:", err);
  });

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
    // ⭐ FIX — MongoStore uses mongoUrl, NOT your Mongoose dbConnect() client
    // This prevents race conditions in Lambda
    //
    if (cfg.sessionType === 'mongodb' || cfg.sessionType === 'mongo') {
      sessionStore = MongoStore.create({
        mongoUrl: cfg.mongoUrl,
        collectionName: 'sessions',
        touchAfter: 0,
      });
    } else {
      sessionStore = new session.MemoryStore();
    }

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
      console.error("[session] ensureSessionUpToDate error:", e);
    }
  };

  internalResetFn = async () => {
    const cfg = buildConfigFromSettings();
    sessionMiddleware = buildSessionMiddleware(cfg);
    currentConfig = cfg;
  };

  try {
    const cfg = buildConfigFromSettings();
    sessionMiddleware = buildSessionMiddleware(cfg);
    currentConfig = cfg;
  } catch (e) {
    console.error("[session] initial build failed:", e);
    sessionMiddleware = (req, res, next) => next();
  }

  const wrapped = (req, res, next) => {
    // If DB connection failed during startup, immediately return a clear 500.
    if (dbConnectError) {
      console.error('[session] rejecting request due to DB connect failure:', dbConnectError);
      if (res && typeof res.status === 'function' && typeof res.json === 'function') {
        res.status(500).json({ error: 'Database connection failed; please try again later.' });
      } else {
        next(new Error('Database connection failed; please try again later.'));
      }
      return;
    }
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

          const originalEnd = res.end;
          res.end = function (...args) {
            try {
              applyDynamicSessionSettings();
            } catch (e) {}
            return originalEnd.apply(this, args);
          };

        } catch (e) {
          console.error("[session] dynamic cookie error:", e);
        }

        next();
      });
    }).catch((err) => {
      console.error("[session] ensureSessionUpToDate() FAILED:", err);
      sessionMiddleware(req, res, next);
    });
  };

  return wrapped;
}
