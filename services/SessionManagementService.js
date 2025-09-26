// In-memory session manager
// Features:
// - track sessions by chatId
// - touch session to extend TTL
// - capacity limit (max concurrent sessions)
// - per-session token-bucket rate limiter

class CreditBucket {
  constructor({ capacity = 60, refillPerSec = 1 }) {
    this.capacity = capacity;
    this.credits = capacity;
    this.refillPerSec = refillPerSec;
    this.lastRefill = Date.now();
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    const add = elapsed * this.refillPerSec;
    this.credits = Math.min(this.capacity, this.credits + add);
    this.lastRefill = now;
  }

  // consume credits from the bucket (returns true if enough credits exist)
  consume(count = 1) {
    this._refill();
    if (this.credits >= count) {
      this.credits -= count;
      return true;
    }
    return false;
  }

  getCredits() {
    this._refill();
    return this.credits;
  }
}

import { SettingsService } from './SettingsService.js';

class SessionManagementService {
  constructor() {
    // Map chatId -> { chatId, createdAt, lastSeen, ttl, bucket }
    this.sessions = new Map();
    this.defaultTTL = 1000 * 60 * 60; // 1 hour fallback
    this.cleanupInterval = 1000 * 60; // 1 minute fallback
    this.maxSessions = 1000; // default capacity fallback
    // default rate limit applied to new sessions unless overridden (fallback)
    this.defaultRateLimit = { capacity: 60, refillPerSec: 1 };
    // Track anonymous session creation attempts to prevent churn abuse
  this.fingerprintCounters = new Map();
  this.fingerprintLimit = { perWindow: 2, windowMs: 24 * 60 * 60 * 1000 }; // 2 sessions / 24h per fingerprint
  this.maxFingerprintEntries = 10000;
    // NOTE: we no longer load settings at construction. Session settings are read
    // live from SettingsService (which caches values) when needed.
    this._startCleanup();
  }

  _startCleanup() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.sessions.entries()) {
        if (now - v.lastSeen > v.ttl) {
          this.sessions.delete(k);
        }
      }
    }, this.cleanupInterval);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  configure({ defaultTTLMs, maxSessions, cleanupIntervalMs } = {}) {
    if (defaultTTLMs) this.defaultTTL = defaultTTLMs;
    if (maxSessions) this.maxSessions = maxSessions;
    if (cleanupIntervalMs) {
      clearInterval(this.cleanupTimer);
      this.cleanupInterval = cleanupIntervalMs;
      this._startCleanup();
    }
  }

  hasCapacity() {
    return this.sessions.size < this.maxSessions;
  }

  // fingerprintKey: optional HMACed fingerprint. When provided it should be pre-verified by middleware
  // (i.e., the server has validated the raw client fingerprint and issued a signed cookie).
  canCreateSession({ fingerprintKey = null } = {}) {
    const increments = [];
    if (fingerprintKey) {
      const entry = this._getWindowCounter(this.fingerprintCounters, fingerprintKey, this.fingerprintLimit.windowMs, this.maxFingerprintEntries);
      if (entry.count >= this.fingerprintLimit.perWindow) {
        return { ok: false, reason: 'fingerprintThrottled' };
      }
      increments.push(() => entry.count++);
    }

    increments.forEach((fn) => fn());
    return { ok: true };
  }

  async register(chatId, { ttlMs, rateLimit } = {}) {
    if (!chatId) throw new Error('chatId required');
    if (!this.hasCapacity() && !this.sessions.has(chatId)) {
      return { ok: false, reason: 'capacity' };
    }

    const now = Date.now();
    // Determine TTL: prefer explicit ttlMs, otherwise read live setting
    let ttl = ttlMs || this.defaultTTL;
    try {
      const ttlM = Number(await SettingsService.get('session.defaultTTLMinutes')) || null;
      if (!ttlMs && ttlM !== null) ttl = ttlM * 60 * 1000;
    } catch (e) {
      // ignore and use fallback
    }

    let session = this.sessions.get(chatId);
    if (!session) {
      // create token bucket for rate limiting. If caller provided rateLimit use it,
      // otherwise read live values from SettingsService (cached) and fall back.
      let rl = rateLimit || this.defaultRateLimit;
      try {
        const capacity = Number(await SettingsService.get('session.rateLimitCapacity')) || null;
        const refill = Number(await SettingsService.get('session.rateLimitRefillPerSec')) || null;
        if (!rateLimit && (capacity !== null || refill !== null)) {
          rl = { capacity: capacity || this.defaultRateLimit.capacity, refillPerSec: refill || this.defaultRateLimit.refillPerSec };
        }
      } catch (e) {
        // ignore and use fallback
      }
      const bucket = new CreditBucket({
        capacity: rl.capacity,
        refillPerSec: rl.refillPerSec
      });
      session = {
        chatId,
        createdAt: now,
        lastSeen: now,
        ttl,
        bucket,
        // metrics
        requestCount: 0,
        errorCount: 0,
        totalLatencyMs: 0,
        lastLatencyMs: 0
        ,
        // timestamps of requests (ms since epoch) used to compute RPM
        requestTimestamps: []
        ,
        // per-error-type counters: { <type>: count }
        errorTypes: {}
      };
      this.sessions.set(chatId, session);
    } else {
      session.lastSeen = now;
      session.ttl = ttl; // allow updating ttl
    }

    return { ok: true, session };
  }


  getCurrentSettings() {
    return {
      defaultTTLMs: this.defaultTTL,
      cleanupIntervalMs: this.cleanupInterval,
      rateLimit: this.defaultRateLimit,
      maxSessions: this.maxSessions
    };
  }

  touch(chatId) {
    const session = this.sessions.get(chatId);
    if (!session) return false;
    session.lastSeen = Date.now();
    return true;
  }

  recordRequest(chatId, { latencyMs = 0, error = false, errorType = null } = {}) {
    const session = this.sessions.get(chatId);
    if (!session) return false;
    session.requestCount = (session.requestCount || 0) + 1;
    if (error) session.errorCount = (session.errorCount || 0) + 1;
    // support errorType counting when provided
    if (errorType) {
      session.errorTypes = session.errorTypes || {};
      session.errorTypes[errorType] = (session.errorTypes[errorType] || 0) + 1;
    }
    if (typeof latencyMs === 'number' && latencyMs >= 0) {
      session.lastLatencyMs = latencyMs;
      session.totalLatencyMs = (session.totalLatencyMs || 0) + latencyMs;
    }
    // record timestamp for RPM calculation
    try {
      const now = Date.now();
      session.requestTimestamps = session.requestTimestamps || [];
      session.requestTimestamps.push(now);
      // keep timestamps bounded by pruning anything older than 5 minutes
      const pruneBefore = now - (5 * 60 * 1000);
      let i = 0;
      while (i < session.requestTimestamps.length && session.requestTimestamps[i] < pruneBefore) i++;
      if (i > 0) session.requestTimestamps.splice(0, i);
    } catch (e) {
      // ignore timestamp recording errors
    }
    return true;
  }

  getSummary() {
    const out = [];
    for (const [k, v] of this.sessions.entries()) {
      out.push({
        chatId: k,
        createdAt: v.createdAt,
        lastSeen: v.lastSeen,
        ttl: v.ttl,
        requestCount: v.requestCount || 0,
        errorCount: v.errorCount || 0,
        // expose per-error-type counts and an "other" bucket
        errorTypes: v.errorTypes || {},
        errorTypesOther: (() => {
          try {
            const byType = v.errorTypes || {};
            const sumSpecific = Object.values(byType).reduce((a, b) => a + b, 0);
            const other = (v.errorCount || 0) - sumSpecific;
            return other > 0 ? other : 0;
          } catch (e) {
            return 0;
          }
        })(),
        lastLatencyMs: v.lastLatencyMs || 0,
        avgLatencyMs: v.requestCount ? Math.round((v.totalLatencyMs || 0) / v.requestCount) : 0,
        // requests per minute: count of requests in the last 60 seconds
        rpm: (() => {
          try {
            const now = Date.now();
            const mts = v.requestTimestamps || [];
            let count = 0;
            for (let i = mts.length - 1; i >= 0; i--) {
              if (now - mts[i] <= 60 * 1000) count++; else break;
            }
            return count;
          } catch (e) {
            return 0;
          }
        })()
      });
    }
    return out;
  }

  unregister(chatId) {
    return this.sessions.delete(chatId);
  }

  // Check and consume credits from the session's bucket. Returns {ok, remaining}.
  canConsume(chatId, credits = 1) {
    const session = this.sessions.get(chatId);
    if (!session) return { ok: false, reason: 'no_session' };
    const allowed = session.bucket.consume(credits);
    if (allowed) {
      return { ok: true, remaining: session.bucket.getCredits() };
    }
    // not enough credits
    return { ok: false, reason: 'noCredits', remaining: session.bucket.getCredits() };
  }

  getInfo(chatId) {
    return this.sessions.get(chatId);
  }

  shutdown() {
    clearInterval(this.cleanupTimer);
    this.sessions.clear();
    this.fingerprintCounters.clear();
    this.ipCounters.clear();
  }
}

SessionManagementService.prototype._getWindowCounter = function (map, key, windowMs, maxEntries) {
  const now = Date.now();
  let entry = map.get(key);
  if (!entry || (now - entry.windowStart) >= windowMs) {
    entry = { count: 0, windowStart: now };
    map.set(key, entry);
  }

  if (map.size > maxEntries) {
    // simple pruning strategy: remove oldest 5 entries (best effort)
    let removed = 0;
    for (const [k, v] of map.entries()) {
      if (now - v.windowStart >= windowMs || removed < 5) {
        map.delete(k);
        removed++;
      }
      if (removed >= 5) break;
    }
  }

  return entry;
};

const singleton = new SessionManagementService();
export default singleton;
