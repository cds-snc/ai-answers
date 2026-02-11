import { RateLimiterMemory, RateLimiterMongo } from 'rate-limiter-flexible';
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import dbConnect from '../api/db/db-connect.js';
import { SettingsService } from '../services/SettingsService.js';

// Internal reset hook (will be set when middleware initializes)
let internalResetFn = async () => { };

// Exported helper to force a reset from other modules (admin endpoint/tests)
export async function resetRateLimiters() {
  return internalResetFn();
}

// Exported helper to read the current limiter-related settings from cache/env
export function getRateLimiterConfig() {
  const persistenceNow = (String(_getSetting(['session.rateLimitPersistence', 'SESSION_RATE_LIMIT_PERSISTENCE']) || process.env.SESSION_RATE_LIMIT_PERSISTENCE || 'memory')).toLowerCase();
  const publicCapacityNow = Number(_getSetting(['session.rateLimitCapacity', 'SESSION_RATE_LIMIT_CAPACITY']) || process.env.SESSION_RATE_LIMIT_CAPACITY || '60');
  const authCapacityNow = Number(_getSetting(['session.authenticatedRateLimitCapacity', 'SESSION_AUTH_RATE_LIMIT_CAPACITY']) || process.env.SESSION_AUTH_RATE_LIMIT_CAPACITY || '300');

  // Read refill rates (tokens per minute)
  const publicRefillNow = Number(_getSetting(['session.rateLimitRefillPerSec', 'SESSION_RATE_LIMIT_REFILL']) || process.env.SESSION_RATE_LIMIT_REFILL || '60');
  const authRefillNow = Number(_getSetting(['session.authenticatedRateLimitRefillPerSec', 'SESSION_AUTH_RATE_LIMIT_REFILL']) || process.env.SESSION_AUTH_RATE_LIMIT_REFILL || '300');

  return {
    persistence: persistenceNow,
    publicCapacity: publicCapacityNow,
    authCapacity: authCapacityNow,
    publicRefill: publicRefillNow,
    authRefill: authRefillNow
  };
}

const _getSetting = (keys) => {
  for (const k of keys) {
    const v = SettingsService.get(k);
    if (typeof v !== 'undefined' && v !== null && v !== '') return v;
  }
  return undefined;
};

// Expose limiters logic/state for monitoring
export const rateLimiters = { public: null, auth: null };

// Internal promise identifying if the middleware is ready
let middlewarePromise = null;

/**
 * Core function to build the actual rate limiter middleware function.
 * This is now internal and called by verify/init logic.
 */
async function buildMiddlewareInternal() {
  const persistence = (String(_getSetting(['session.rateLimitPersistence', 'SESSION_RATE_LIMIT_PERSISTENCE']) || process.env.SESSION_RATE_LIMIT_PERSISTENCE || 'mongo')).toLowerCase();

  const publicCapacity = Number(_getSetting(['session.rateLimitCapacity', 'SESSION_RATE_LIMIT_CAPACITY']) || process.env.SESSION_RATE_LIMIT_CAPACITY || '60');
  const authCapacity = Number(_getSetting(['session.authenticatedRateLimitCapacity', 'SESSION_AUTH_RATE_LIMIT_CAPACITY']) || process.env.SESSION_AUTH_RATE_LIMIT_CAPACITY || '300');

  const publicRefill = Number(_getSetting(['session.rateLimitRefillPerSec', 'SESSION_RATE_LIMIT_REFILL']) || process.env.SESSION_RATE_LIMIT_REFILL || '60');
  const authRefill = Number(_getSetting(['session.authenticatedRateLimitRefillPerSec', 'SESSION_AUTH_RATE_LIMIT_REFILL']) || process.env.SESSION_AUTH_RATE_LIMIT_REFILL || '300');

  let publicLimiter;
  let authLimiter;
  let mongoClient;

  // Track current configuration so we can hot-swap when settings change
  let currentConfig = {
    persistence,
    publicCapacity,
    authCapacity,
    publicRefill,
    authRefill
  };

  // Helper to calculate duration based on capacity and refill rate (tokens/min)
  const calculateDuration = (capacity, refill) => {
    if (!refill || refill <= 0) return 60; // Default to 1 minute if refill is invalid
    return Math.ceil((capacity / refill) * 60);
  };

  // Build / rebuild the limiters. Safe to call multiple times.
  const buildLimiters = async () => {
    // local references for this build
    let newMongoClient = mongoClient;
    let newPublicLimiter;
    let newAuthLimiter;

    const publicDuration = calculateDuration(currentConfig.publicCapacity, currentConfig.publicRefill);
    const authDuration = calculateDuration(currentConfig.authCapacity, currentConfig.authRefill);

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
        duration: publicDuration,
        tableName: 'rate_limiter_public'
      });

      newAuthLimiter = new RateLimiterMongo({
        storeClient: newMongoClient,
        points: Number.isFinite(currentConfig.authCapacity) && currentConfig.authCapacity > 0 ? currentConfig.authCapacity : 300,
        duration: authDuration,
        tableName: 'rate_limiter_auth'
      });
    } else {
      newPublicLimiter = new RateLimiterMemory({
        points: Number.isFinite(currentConfig.publicCapacity) && currentConfig.publicCapacity > 0 ? currentConfig.publicCapacity : 60,
        duration: publicDuration
      });

      newAuthLimiter = new RateLimiterMemory({
        points: Number.isFinite(currentConfig.authCapacity) && currentConfig.authCapacity > 0 ? currentConfig.authCapacity : 300,
        duration: authDuration
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
    currentConfig.publicRefill = cfg.publicRefill;
    currentConfig.authRefill = cfg.authRefill;
    await buildLimiters();
  };

  // Initialize once
  await internalResetFn();

  // Helper: check current settings and reset limiters if they changed
  const ensureLimitersUpToDate = async () => {
    try {
      const cfg = getRateLimiterConfig();
      if (
        cfg.persistence !== currentConfig.persistence ||
        cfg.publicCapacity !== currentConfig.publicCapacity ||
        cfg.authCapacity !== currentConfig.authCapacity ||
        cfg.publicRefill !== currentConfig.publicRefill ||
        cfg.authRefill !== currentConfig.authRefill
      ) {
        // Update config and rebuild.
        currentConfig.persistence = cfg.persistence;
        currentConfig.publicCapacity = cfg.publicCapacity;
        currentConfig.authCapacity = cfg.authCapacity;
        currentConfig.publicRefill = cfg.publicRefill;
        currentConfig.authRefill = cfg.authRefill;
        await internalResetFn();
      }
    } catch (e) {
      // Don't block requests if the dynamic check fails; proceed with existing limiters
    }
  };

  // Actual middleware function logic
  return async function rateLimit(req, res, next) {
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
        lastUpdated: new Date().toISOString(),
        authenticated: isAuthenticated
      };
      // Attach to request for potential handler use
      req.rateLimiterSnapshot = rateLimiterSnapshot;
      // console.log(`RateLimiter: allowed request for key=${key} (auth=${isAuthenticated}) remaining=${reward.remainingPoints}`);
      return next();
    } catch (rej) {
      // RateLimiter throws when points exhausted
      res.setHeader('Retry-After', String(Math.ceil((rej?.msBeforeNext || 1000) / 1000)));
      return res.status(429).send('Too many requests');
    }
  };
}

/**
 * Initializes the rate limiter middleware asynchronously.
 */
export function initializeRateLimiter() {
  middlewarePromise = buildMiddlewareInternal();
  return middlewarePromise;
}

/**
 * The unified middleware to usage in express.
 * It waits for initialization or skips if not ready (though typically it will be awaited in server start).
 */
export async function rateLimiterMiddleware(req, res, next) {
  if (!middlewarePromise) {
    return next();
  }
  try {
    const mw = await middlewarePromise;
    return mw(req, res, next);
  } catch (e) {
    console.error('Rate limiter middleware fatal error', e);
    return next();
  }
}

