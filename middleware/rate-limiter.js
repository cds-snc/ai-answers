import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import { createClient } from 'redis';
import { SettingsService } from '../services/SettingsService.js';

// Internal reset hook (will be set when middleware initializes)
let internalResetFn = async () => { };

// Exported helper to force a reset from other modules (admin endpoint/tests)
export async function resetRateLimiters() {
  return internalResetFn();
}

function normalizePersistence(value) {
  const norm = (String(value || '')).toLowerCase();
  if (norm === 'redis') return 'redis';
  return 'memory';
}

function toBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const norm = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(norm)) return true;
  if (['false', '0', 'no', 'off'].includes(norm)) return false;
  return defaultValue;
}

// Exported helper to read the current limiter-related settings from cache/env
export function getRateLimiterConfig() {
  const persistenceNow = normalizePersistence(_getSetting(['session.rateLimitPersistence', 'SESSION_RATE_LIMIT_PERSISTENCE']) || process.env.SESSION_RATE_LIMIT_PERSISTENCE || 'memory');
  const publicCapacityNow = Number(_getSetting(['session.rateLimitCapacity', 'SESSION_RATE_LIMIT_CAPACITY']) || process.env.SESSION_RATE_LIMIT_CAPACITY || '60');

  // Read refill rates (tokens per minute)
  const publicRefillNow = Number(_getSetting(['session.rateLimitRefillPerSec', 'SESSION_RATE_LIMIT_REFILL']) || process.env.SESSION_RATE_LIMIT_REFILL || '60');
  const singleAnonymousChatRunEnabled = toBoolean(_getSetting(['session.singleAnonymousChatRunEnabled', 'SESSION_SINGLE_ANONYMOUS_CHAT_RUN_ENABLED']) || process.env.SESSION_SINGLE_ANONYMOUS_CHAT_RUN_ENABLED, true);

  return {
    persistence: persistenceNow,
    publicCapacity: publicCapacityNow,
    publicRefill: publicRefillNow,
    singleAnonymousChatRunEnabled
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
export const rateLimiters = { public: null };

// Internal promise identifying if the middleware is ready
let middlewarePromise = null;
const activeAnonymousChatRuns = new Set();

export function buildRateLimiterIdentity(req, isAuthenticated) {
  if (isAuthenticated && req && req.sessionID) {
    return { key: `auth:${req.sessionID}`, keyType: 'auth' };
  }

  const visitorId = req?.session?.visitorId;
  if (visitorId) {
    return { key: `visitor:${visitorId}`, keyType: 'visitor' };
  }

  if (req && req.sessionID) {
    return { key: `session:${req.sessionID}`, keyType: 'session' };
  }

  if (req && req.ip) {
    return { key: `ip:${req.ip}`, keyType: 'ip' };
  }

  return { key: 'unknown', keyType: 'unknown' };
}

function isChatGraphRun(req) {
  return req?.method === 'POST' && String(req.originalUrl || req.url || '').includes('/api/chat/chat-graph-run');
}

async function acquireAnonymousChatRun({ req, key, persistence, redisClient }) {
  if (!isChatGraphRun(req)) return () => {};

  const lockKey = `aianswers:chat-run:${key}`;
  if (persistence === 'redis') {
    const acquired = await redisClient.set(lockKey, '1', { NX: true, EX: 300 });
    if (acquired !== 'OK') return null;
    return () => {
      redisClient.del(lockKey).catch((err) => {
        console.error('[RateLimiter] Failed to release Redis chat-run lock', { message: err.message });
      });
    };
  }

  if (activeAnonymousChatRuns.has(lockKey)) return null;
  activeAnonymousChatRuns.add(lockKey);
  return () => {
    activeAnonymousChatRuns.delete(lockKey);
  };
}

/**
 * Core function to build the actual rate limiter middleware function.
 * This is now internal and called by verify/init logic.
 */
async function buildMiddlewareInternal() {
  const persistence = normalizePersistence(_getSetting(['session.rateLimitPersistence', 'SESSION_RATE_LIMIT_PERSISTENCE']) || process.env.SESSION_RATE_LIMIT_PERSISTENCE || 'memory');

  const publicCapacity = Number(_getSetting(['session.rateLimitCapacity', 'SESSION_RATE_LIMIT_CAPACITY']) || process.env.SESSION_RATE_LIMIT_CAPACITY || '60');
  const publicRefill = Number(_getSetting(['session.rateLimitRefillPerSec', 'SESSION_RATE_LIMIT_REFILL']) || process.env.SESSION_RATE_LIMIT_REFILL || '60');

  let publicLimiter;
  let redisClient;

  // Track current configuration so we can hot-swap when settings change
  let currentConfig = {
    persistence,
    publicCapacity,
    publicRefill,
    singleAnonymousChatRunEnabled: getRateLimiterConfig().singleAnonymousChatRunEnabled
  };

  // Helper to calculate duration based on capacity and refill rate (tokens/min)
  const calculateDuration = (capacity, refill) => {
    if (!refill || refill <= 0) return 60; // Default to 1 minute if refill is invalid
    return Math.ceil((capacity / refill) * 60);
  };

  // Build / rebuild the limiters. Safe to call multiple times.
  const buildLimiters = async () => {
    // local references for this build
    let newRedisClient = redisClient;
    let newPublicLimiter;

    const publicDuration = calculateDuration(currentConfig.publicCapacity, currentConfig.publicRefill);

    if (currentConfig.persistence === 'redis') {
      const redisUrl = _getSetting(['redis.url', 'REDIS_URL']) || process.env.REDIS_URL || 'redis://127.0.0.1:6379';

      if (!newRedisClient) {
        newRedisClient = createClient({ url: redisUrl });
        newRedisClient.on('error', (err) => console.error('[RateLimiter] Redis error:', err));
        await newRedisClient.connect();
      }

      newPublicLimiter = new RateLimiterRedis({
        storeClient: newRedisClient,
        points: Number.isFinite(currentConfig.publicCapacity) && currentConfig.publicCapacity > 0 ? currentConfig.publicCapacity : 60,
        duration: publicDuration,
        keyPrefix: 'aianswers:rl:public',
        useRedisPackage: true,
      });
    } else {
      newPublicLimiter = new RateLimiterMemory({
        points: Number.isFinite(currentConfig.publicCapacity) && currentConfig.publicCapacity > 0 ? currentConfig.publicCapacity : 60,
        duration: publicDuration
      });
    }

    // Atomically swap in new limiters and client reference
    publicLimiter = newPublicLimiter;
    redisClient = newRedisClient;

    // Expose for monitoring
    rateLimiters.public = publicLimiter;
  };

  // Assign internal reset hook so other modules can trigger rebuilds
  internalResetFn = async () => {
    // Re-read settings into currentConfig before rebuild using exported getter
    const cfg = getRateLimiterConfig();
    currentConfig.persistence = cfg.persistence;
    currentConfig.publicCapacity = cfg.publicCapacity;
    currentConfig.publicRefill = cfg.publicRefill;
    currentConfig.singleAnonymousChatRunEnabled = cfg.singleAnonymousChatRunEnabled;
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
        cfg.publicRefill !== currentConfig.publicRefill ||
        cfg.singleAnonymousChatRunEnabled !== currentConfig.singleAnonymousChatRunEnabled
      ) {
        // Update config and rebuild.
        currentConfig.persistence = cfg.persistence;
        currentConfig.publicCapacity = cfg.publicCapacity;
        currentConfig.publicRefill = cfg.publicRefill;
        currentConfig.singleAnonymousChatRunEnabled = cfg.singleAnonymousChatRunEnabled;
        await internalResetFn();
      }
    } catch (e) {
      // Don't block requests if the dynamic check fails; proceed with existing limiters
    }
  };

  // Actual middleware function logic
  return async function rateLimit(req, res, next) {
    await ensureLimitersUpToDate();
    const isAuthenticated = !!(
      req.user ||
      (req.session && (
        (req.session.passport && req.session.passport.user) ||
        req.session.user
      ))
    );
    if (isAuthenticated) {
      return next();
    }

    const { key, keyType } = buildRateLimiterIdentity(req, isAuthenticated);
    const limiter = publicLimiter;

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
        authenticated: isAuthenticated,
        keyType
      };
      // Attach to request for potential handler use
      req.rateLimiterSnapshot = rateLimiterSnapshot;

      let releaseChatRun = () => {};
      if (!isAuthenticated && currentConfig.singleAnonymousChatRunEnabled) {
        const acquired = await acquireAnonymousChatRun({
          req,
          key,
          persistence: currentConfig.persistence,
          redisClient,
        });
        if (!acquired) {
          return res.status(429).json({
            error: 'chat_run_in_progress',
            message: 'A chat response is already in progress for this session',
          });
        }
        releaseChatRun = acquired;
      }

      let released = false;
      const releaseOnce = () => {
        if (released) return;
        released = true;
        releaseChatRun();
      };
      res.on?.('finish', releaseOnce);
      res.on?.('close', releaseOnce);

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
