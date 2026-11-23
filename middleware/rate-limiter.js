import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import { createClient } from 'redis';
import crypto from 'crypto';
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
  const authenticatedCapacityNow = Number(_getSetting(['session.authenticatedRateLimitCapacity', 'SESSION_AUTHENTICATED_RATE_LIMIT_CAPACITY']) || process.env.SESSION_AUTHENTICATED_RATE_LIMIT_CAPACITY || '300');

  // Read refill rates (tokens per minute)
  const publicRefillNow = Number(_getSetting(['session.rateLimitRefillPerSec', 'SESSION_RATE_LIMIT_REFILL']) || process.env.SESSION_RATE_LIMIT_REFILL || '60');
  const authenticatedRefillNow = Number(_getSetting(['session.authenticatedRateLimitRefillPerSec', 'SESSION_AUTHENTICATED_RATE_LIMIT_REFILL']) || process.env.SESSION_AUTHENTICATED_RATE_LIMIT_REFILL || '300');
  const singleAnonymousChatRunEnabled = toBoolean(_getSetting(['session.singleAnonymousChatRunEnabled', 'SESSION_SINGLE_ANONYMOUS_CHAT_RUN_ENABLED']) || process.env.SESSION_SINGLE_ANONYMOUS_CHAT_RUN_ENABLED, true);

  return {
    persistence: persistenceNow,
    publicCapacity: publicCapacityNow,
    publicRefill: publicRefillNow,
    authenticatedCapacity: authenticatedCapacityNow,
    authenticatedRefill: authenticatedRefillNow,
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
export const rateLimiters = { public: null, authenticated: null, ip: null };

// Anonymous chat runs also draw from a per-address budget this many times the
// public quota. req.ip is often a shared proxy address (trust proxy is 1, with
// Akamai and the load balancer in front). Charging it on every API call would
// put strangers on that address in one small pool. It is spent only on the
// chat run, and a new session cookie does not move it.
export const ANONYMOUS_IP_BACKSTOP_MULTIPLIER = 20;

function positivePoints(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Passport stores the account id on req.user only after deserializeUser
// accepts an active account. A passport blob left on the session is not
// enough: counting it would grant the authenticated quota.
function accountId(user) {
  const id = user?.userId;
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 128) return null;
  return trimmed;
}

function browserLimit(req) {
  const visitorId = req?.session?.visitorId;
  if (typeof visitorId === 'string' && visitorId.trim()) {
    return { key: `visitor:${visitorId.trim()}`, keyType: 'visitor', bucket: 'public' };
  }
  if (typeof req?.sessionID === 'string' && req.sessionID) {
    return { key: `session:${req.sessionID}`, keyType: 'session', bucket: 'public' };
  }
  return null;
}

// req.ip is the address Express already trusted. A caller-supplied
// X-Forwarded-For is ignored: the load balancer is open to the internet, so
// trusting another hop would let the caller pick a new budget. An IPv4
// address written as ::ffff:a.b.c.d is the same address.
function networkAddress(ip) {
  if (typeof ip !== 'string') return '';
  const value = ip.trim();
  const mapped = value.toLowerCase().startsWith('::ffff:') ? value.slice('::ffff:'.length) : '';
  if (mapped.includes('.')) return mapped;
  return value;
}

function networkLimit(req) {
  const ip = networkAddress(req?.ip);
  if (ip) return { key: `ip:${ip}`, keyType: 'ip', bucket: 'ipBackstop' };
  return { key: 'unknown', keyType: 'unknown', bucket: 'public' };
}

// Internal promise identifying if the middleware is ready
let middlewarePromise = null;
const activeAnonymousChatRuns = new Set();

/**
 * Quota keys for one request.
 * Signed-in: the account id. A new session for the same account stays in
 * that bucket. Anonymous: the browser fingerprint or session id. An anonymous
 * chat run also spends the trusted address budget, which a discarded cookie
 * cannot change.
 */
export function buildRateLimiterIdentity(req) {
  const userId = accountId(req?.user);
  if (userId) {
    const key = `user:${userId}`;
    return {
      authenticated: true,
      chatRunKey: key,
      limits: [{ key, keyType: 'auth', bucket: 'authenticated' }],
    };
  }

  const browser = browserLimit(req);
  const limits = [];
  if (isChatGraphRun(req)) limits.push(networkLimit(req));
  if (browser) limits.push(browser);
  if (limits.length === 0) limits.push(networkLimit(req));

  return {
    authenticated: false,
    chatRunKey: browser?.key || limits[0].key,
    limits,
  };
}

function isChatGraphRun(req) {
  return req?.method === 'POST' && String(req.originalUrl || req.url || '').includes('/api/chat/chat-graph-run');
}

async function acquireAnonymousChatRun({ req, key, persistence, redisClient }) {
  if (!isChatGraphRun(req)) return () => {};

  const lockKey = `aianswers:chat-run:${key}`;
  if (persistence === 'redis') {
    const lockToken = crypto.randomUUID();
    const acquired = await redisClient.set(lockKey, lockToken, { NX: true, EX: 300 });
    if (acquired !== 'OK') return null;
    return () => {
      redisClient.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        { keys: [lockKey], arguments: [lockToken] },
      ).catch((err) => {
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
  const authenticatedCapacity = Number(_getSetting(['session.authenticatedRateLimitCapacity', 'SESSION_AUTHENTICATED_RATE_LIMIT_CAPACITY']) || process.env.SESSION_AUTHENTICATED_RATE_LIMIT_CAPACITY || '300');
  const authenticatedRefill = Number(_getSetting(['session.authenticatedRateLimitRefillPerSec', 'SESSION_AUTHENTICATED_RATE_LIMIT_REFILL']) || process.env.SESSION_AUTHENTICATED_RATE_LIMIT_REFILL || '300');

  let publicLimiter;
  let authenticatedLimiter;
  let ipLimiter;
  let redisClient;

  // Track current configuration so we can hot-swap when settings change
  let currentConfig = {
    persistence,
    publicCapacity,
    publicRefill,
    authenticatedCapacity,
    authenticatedRefill,
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
    let newAuthenticatedLimiter;
    let newIpLimiter;

    const publicDuration = calculateDuration(currentConfig.publicCapacity, currentConfig.publicRefill);
    const authenticatedDuration = calculateDuration(currentConfig.authenticatedCapacity, currentConfig.authenticatedRefill);
    const publicPoints = positivePoints(currentConfig.publicCapacity, 60);
    const authenticatedPoints = positivePoints(currentConfig.authenticatedCapacity, 300);
    const ipPoints = Math.max(publicPoints * ANONYMOUS_IP_BACKSTOP_MULTIPLIER, authenticatedPoints);

    if (currentConfig.persistence === 'redis') {
      const redisUrl = _getSetting(['redis.url', 'REDIS_URL']) || process.env.REDIS_URL || 'redis://127.0.0.1:6379';

      if (!newRedisClient) {
        newRedisClient = createClient({ url: redisUrl });
        newRedisClient.on('error', (err) => console.error('[RateLimiter] Redis error:', err));
        await newRedisClient.connect();
      }

      newPublicLimiter = new RateLimiterRedis({
        storeClient: newRedisClient,
        points: publicPoints,
        duration: publicDuration,
        keyPrefix: 'aianswers:rl:public',
        useRedisPackage: true,
      });
      newAuthenticatedLimiter = new RateLimiterRedis({
        storeClient: newRedisClient,
        points: authenticatedPoints,
        duration: authenticatedDuration,
        keyPrefix: 'aianswers:rl:authenticated',
        useRedisPackage: true,
      });
      newIpLimiter = new RateLimiterRedis({
        storeClient: newRedisClient,
        points: ipPoints,
        duration: publicDuration,
        keyPrefix: 'aianswers:rl:ip',
        useRedisPackage: true,
      });
    } else {
      newPublicLimiter = new RateLimiterMemory({
        points: publicPoints,
        duration: publicDuration
      });
      newAuthenticatedLimiter = new RateLimiterMemory({
        points: authenticatedPoints,
        duration: authenticatedDuration
      });
      newIpLimiter = new RateLimiterMemory({
        points: ipPoints,
        duration: publicDuration
      });
    }

    // Atomically swap in new limiters and client reference
    publicLimiter = newPublicLimiter;
    authenticatedLimiter = newAuthenticatedLimiter;
    ipLimiter = newIpLimiter;
    redisClient = newRedisClient;

    // Expose for monitoring
    rateLimiters.public = publicLimiter;
    rateLimiters.authenticated = authenticatedLimiter;
    rateLimiters.ip = ipLimiter;
  };

  // Assign internal reset hook so other modules can trigger rebuilds
  internalResetFn = async () => {
    // Re-read settings into currentConfig before rebuild using exported getter
    const cfg = getRateLimiterConfig();
    currentConfig.persistence = cfg.persistence;
    currentConfig.publicCapacity = cfg.publicCapacity;
    currentConfig.publicRefill = cfg.publicRefill;
    currentConfig.authenticatedCapacity = cfg.authenticatedCapacity;
    currentConfig.authenticatedRefill = cfg.authenticatedRefill;
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
        cfg.authenticatedCapacity !== currentConfig.authenticatedCapacity ||
        cfg.authenticatedRefill !== currentConfig.authenticatedRefill ||
        cfg.singleAnonymousChatRunEnabled !== currentConfig.singleAnonymousChatRunEnabled
      ) {
        // Update config and rebuild.
        currentConfig.persistence = cfg.persistence;
        currentConfig.publicCapacity = cfg.publicCapacity;
        currentConfig.publicRefill = cfg.publicRefill;
        currentConfig.authenticatedCapacity = cfg.authenticatedCapacity;
        currentConfig.authenticatedRefill = cfg.authenticatedRefill;
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
    const identity = buildRateLimiterIdentity(req);

    let releaseChatRun = () => {};
    try {
      if (!identity.authenticated && currentConfig.singleAnonymousChatRunEnabled) {
        const acquired = await acquireAnonymousChatRun({
          req,
          key: identity.chatRunKey,
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

      // Every key has to have a point left. On a chat run the address key is
      // first, so a client that rotates session cookies still spends it.
      // The snapshot reports the browser or account bucket. The address pool
      // is a different size, so its remainder is not this browser's credits.
      const limitersByBucket = {
        authenticated: authenticatedLimiter,
        ipBackstop: ipLimiter,
        public: publicLimiter,
      };
      let shown = null;
      for (const limit of identity.limits) {
        const limiter = limitersByBucket[limit.bucket] || publicLimiter;
        const reward = await limiter.consume(limit.key);
        if (limit.bucket !== 'ipBackstop' || !shown) {
          shown = { limit, reward, limiter };
        }
      }
      const points = typeof shown.limiter.points === 'number' ? shown.limiter.points : null;
      const duration = typeof shown.limiter.duration === 'number' ? shown.limiter.duration : null;
      const rateLimiterSnapshot = {
        remainingPoints: shown.reward.remainingPoints,
        consumedPoints: shown.reward.consumedPoints,
        points,
        duration,
        msBeforeNext: shown.reward.msBeforeNext,
        lastUpdated: new Date().toISOString(),
        authenticated: identity.authenticated,
        keyType: shown.limit.keyType
      };
      // Attach to request for potential handler use
      req.rateLimiterSnapshot = rateLimiterSnapshot;

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
      releaseChatRun();
      // RateLimiter throws when points exhausted
      res.setHeader('Retry-After', String(Math.ceil((rej?.msBeforeNext || 1000) / 1000)));
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: "Looks like you're using the system a lot. Please wait a few minutes for more capacity.",
        currentCount: typeof rej?.consumedPoints === 'number' ? rej.consumedPoints : null,
        retryAfterSeconds: Math.ceil((rej?.msBeforeNext || 1000) / 1000)
      });
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
