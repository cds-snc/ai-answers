import { RateLimiterMemory, RateLimiterMongo } from 'rate-limiter-flexible';
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import dbConnect from '../api/db/db-connect.js';
import { SettingsService } from '../services/SettingsService.js';

// Internal reset hook (will be set when middleware initializes)
let internalResetFn = async () => {};

// Exported helper to force a reset from other modules (admin endpoint/tests)
export async function resetRateLimiters() {
  return internalResetFn();
}

// Exported helper to read the current limiter-related settings from cache/env
export function getRateLimiterConfig() {
  const persistenceNow = (String(_getSetting(['session.rateLimitPersistence', 'SESSION_RATE_LIMIT_PERSISTENCE']) || process.env.SESSION_RATE_LIMIT_PERSISTENCE || 'memory')).toLowerCase();
  const publicCapacityNow = Number(_getSetting(['session.rateLimitCapacity', 'SESSION_RATE_LIMIT_CAPACITY']) || process.env.SESSION_RATE_LIMIT_CAPACITY || '60');
  const authCapacityNow = Number(_getSetting(['session.authenticatedRateLimitCapacity', 'SESSION_AUTH_RATE_LIMIT_CAPACITY']) || process.env.SESSION_AUTH_RATE_LIMIT_CAPACITY || '300');
  const windowSecondsNow = 60;
  return {
    persistence: persistenceNow,
    publicCapacity: publicCapacityNow,
    authCapacity: authCapacityNow,
    windowSeconds: windowSecondsNow
  };
}

const _getSetting = (keys) => {
  for (const k of keys) {
    const v = SettingsService.get(k);
    if (typeof v !== 'undefined' && v !== null && v !== '') return v;
  }
  return undefined;
};

export default async function createRateLimiterMiddleware(app) {
  const persistence = (String(_getSetting(['session.rateLimitPersistence', 'SESSION_RATE_LIMIT_PERSISTENCE']) || process.env.SESSION_RATE_LIMIT_PERSISTENCE || 'memory')).toLowerCase();

  const publicCapacity = Number(_getSetting(['session.rateLimitCapacity', 'SESSION_RATE_LIMIT_CAPACITY']) || process.env.SESSION_RATE_LIMIT_CAPACITY || '60');
  const authCapacity = Number(_getSetting(['session.authenticatedRateLimitCapacity', 'SESSION_AUTH_RATE_LIMIT_CAPACITY']) || process.env.SESSION_AUTH_RATE_LIMIT_CAPACITY || '300');
  // Use 60 second windows (admin UI works in per-minute values)
  const windowSeconds = 60;

  let publicLimiter;
  let authLimiter;
  let mongoClient;

  // Track current configuration so we can hot-swap when settings change
  let currentConfig = {
    persistence,
    publicCapacity,
    authCapacity,
    windowSeconds
  };

  // Build / rebuild the limiters. Safe to call multiple times.
  const buildLimiters = async () => {
    // local references for this build
    let newMongoClient = mongoClient;
    let newPublicLimiter;
    let newAuthLimiter;

    if (currentConfig.persistence === 'mongo' || currentConfig.persistence === 'mongodb') {
      const mongoUrl = _getSetting(['mongo.uri', 'MONGODB_URI']) || process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/ai-answers';

      // Try to reuse existing mongoose client
      try {
        await dbConnect();
        newMongoClient = (mongoose.connection && typeof mongoose.connection.getClient === 'function')
          ? mongoose.connection.getClient()
          : (mongoose.connection && mongoose.connection.client) ? mongoose.connection.client : newMongoClient;
      } catch (err) {
        // If dbConnect failed, fall back to previous/new client later
      }

      if (!newMongoClient) {
        newMongoClient = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
        await newMongoClient.connect();
      }

      newPublicLimiter = new RateLimiterMongo({
        storeClient: newMongoClient,
        points: Number.isFinite(currentConfig.publicCapacity) && currentConfig.publicCapacity > 0 ? currentConfig.publicCapacity : 60,
        duration: currentConfig.windowSeconds,
        tableName: 'rate_limiter_public'
      });

      newAuthLimiter = new RateLimiterMongo({
        storeClient: newMongoClient,
        points: Number.isFinite(currentConfig.authCapacity) && currentConfig.authCapacity > 0 ? currentConfig.authCapacity : 300,
        duration: currentConfig.windowSeconds,
        tableName: 'rate_limiter_auth'
      });
    } else {
      newPublicLimiter = new RateLimiterMemory({
        points: Number.isFinite(currentConfig.publicCapacity) && currentConfig.publicCapacity > 0 ? currentConfig.publicCapacity : 60,
        duration: currentConfig.windowSeconds
      });

      newAuthLimiter = new RateLimiterMemory({
        points: Number.isFinite(currentConfig.authCapacity) && currentConfig.authCapacity > 0 ? currentConfig.authCapacity : 300,
        duration: currentConfig.windowSeconds
      });
    }

    // Atomically swap in new limiters and client reference
    publicLimiter = newPublicLimiter;
    authLimiter = newAuthLimiter;
    mongoClient = newMongoClient;

    // Expose for monitoring
    rateLimiters.public = publicLimiter;
    rateLimiters.auth = authLimiter;
  };

  // Assign internal reset hook so other modules can trigger rebuilds
  internalResetFn = async () => {
    // Re-read settings into currentConfig before rebuild using exported getter
    const cfg = getRateLimiterConfig();
    currentConfig.persistence = cfg.persistence;
    currentConfig.publicCapacity = cfg.publicCapacity;
    currentConfig.authCapacity = cfg.authCapacity;
    currentConfig.windowSeconds = cfg.windowSeconds;
    await buildLimiters();
  };

  // Helper: check current settings and reset limiters if they changed
  const ensureLimitersUpToDate = async () => {
    try {
      const cfg = getRateLimiterConfig();
      if (cfg.persistence !== currentConfig.persistence || cfg.publicCapacity !== currentConfig.publicCapacity || cfg.authCapacity !== currentConfig.authCapacity) {
        // Update config and rebuild. This will reset in-memory counters when using memory store.
        currentConfig.persistence = cfg.persistence;
        currentConfig.publicCapacity = cfg.publicCapacity;
        currentConfig.authCapacity = cfg.authCapacity;
        currentConfig.windowSeconds = cfg.windowSeconds;
        await internalResetFn();
      }
    } catch (e) {
      // Don't block requests if the dynamic check fails; proceed with existing limiters
    }
  };

  if (persistence === 'mongo' || persistence === 'mongodb') {
    const mongoUrl = _getSetting(['mongo.uri', 'MONGODB_URI']) || process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/ai-answers';

    // Prefer using the application's existing mongoose connection so we
    // reuse the same MongoClient instance used elsewhere in the app.
    try {
      await dbConnect();
      // Mongoose exposes the native MongoClient via connection.getClient()
      // in newer versions; fall back to connection.client when needed.
      mongoClient = (mongoose.connection && typeof mongoose.connection.getClient === 'function')
        ? mongoose.connection.getClient()
        : (mongoose.connection && mongoose.connection.client) ? mongoose.connection.client : null;
    } catch (err) {
      // If dbConnect failed, we'll fall back to creating a dedicated client.
      mongoClient = null;
      console.warn('Rate limiter: failed to obtain mongoose client, falling back to new MongoClient', err);
    }

    if (!mongoClient) {
      mongoClient = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
      await mongoClient.connect();
    }

    publicLimiter = new RateLimiterMongo({
      storeClient: mongoClient,
      points: Number.isFinite(publicCapacity) && publicCapacity > 0 ? publicCapacity : 60,
      duration: windowSeconds,
      tableName: 'rate_limiter_public'
    });

    authLimiter = new RateLimiterMongo({
      storeClient: mongoClient,
      points: Number.isFinite(authCapacity) && authCapacity > 0 ? authCapacity : 300,
      duration: windowSeconds,
      tableName: 'rate_limiter_auth'
    });
  } else {
    publicLimiter = new RateLimiterMemory({
      points: Number.isFinite(publicCapacity) && publicCapacity > 0 ? publicCapacity : 60,
      duration: windowSeconds
    });

    authLimiter = new RateLimiterMemory({
      points: Number.isFinite(authCapacity) && authCapacity > 0 ? authCapacity : 300,
      duration: windowSeconds
    });
  }

  // Middleware function
  const rateLimitMiddleware = async function rateLimit(req, res, next) {
    await ensureLimitersUpToDate();
    const key = (req && req.session && req.sessionID) ? req.sessionID : req.ip;
    const isAuthenticated = !!(
      req.user ||
      (req.session && (
        (req.session.passport && req.session.passport.user) ||
        req.session.user
      ))
    );
    const limiter = isAuthenticated ? authLimiter : publicLimiter;

    try {
      // consume 1 point per request
      const reward = await limiter.consume(key);
      const points = typeof limiter.points === 'number' ? limiter.points : null;
      const duration = typeof limiter.duration === 'number' ? limiter.duration : null;
      const rateLimiterSnapshot = {
        remainingPoints: reward.remainingPoints,
        consumedPoints: reward.consumedPoints,
        points,
        duration,
        msBeforeNext: reward.msBeforeNext,
        lastUpdated: new Date(),
        authenticated: isAuthenticated
      };
      if (req.session) {
        req.session.rateLimiter = rateLimiterSnapshot;
      }
      req.rateLimiterSnapshot = rateLimiterSnapshot;
      console.log(`RateLimiter: allowed request for key=${key} (auth=${isAuthenticated}) remaining=${reward.remainingPoints}`);
      return next();
    } catch (rej) {
      // RateLimiter throws when points exhausted (rej instanceof Error in some cases)
      // Keep the original output: Retry-After header and plain text body.
      res.setHeader('Retry-After', String(Math.ceil(rej?.msBeforeNext / 1000) || windowSeconds));
      return res.status(429).send('Too many requests');
    }
  };

  // Expose limiters for SessionManagementService metrics
  rateLimiters.public = publicLimiter;
  rateLimiters.auth = authLimiter;

  return rateLimitMiddleware;
}

export const rateLimiters = { public: null, auth: null };
