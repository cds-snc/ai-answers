// In-memory session manager
// Features:
// - track sessions by chatId
// - touch session to extend TTL
// - capacity limit (max concurrent sessions)
// - per-session token-bucket rate limiter
import { v4 as uuidv4 } from 'uuid';
import { SettingsService } from './SettingsService.js';
import dbConnect from '../api/db/db-connect.js';
import { SessionState } from '../models/sessionState.js';

class CreditBucket {
  constructor({ capacity = 60, refillPerSec = 1, isAuthenticated = false }) {
    this.capacity = capacity;
    this.credits = capacity;
    this.refillPerSec = refillPerSec;
    this.lastRefill = Date.now();
    this.isAuthenticated = !!isAuthenticated;
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    // SettingsService.cache is already used internally by SettingsService.get(),
    // so reading from cache directly gives us the same values without async calls.
    // This keeps the hot-path synchronous and avoids DB access during bucket refill.
    try {
      // Read appropriate settings based on authentication status only (no fallback)
      const capKey = this.isAuthenticated ? 'session.authenticatedRateLimitCapacity' : 'session.rateLimitCapacity';
      const refillKey = this.isAuthenticated ? 'session.authenticatedRateLimitRefillPerSec' : 'session.rateLimitRefillPerSec';

      const cachedCap = SettingsService.get(capKey);
      const cachedRefill = SettingsService.get(refillKey);

      if (cachedCap !== null && !Number.isNaN(Number(cachedCap))) {
        this.capacity = Number(cachedCap);
        if (this.credits > this.capacity) this.credits = this.capacity;
      }
      if (cachedRefill !== null && !Number.isNaN(Number(cachedRefill))) {
        this.refillPerSec = Number(cachedRefill);
      }
    } catch (e) { /* best-effort, ignore errors */ }

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


class SessionManagementService {
  constructor() {
    // Map sessionId -> { sessionId, chatId, createdAt, lastSeen, ttl, bucket }
    this.sessions = new Map();
    // Map chatId -> sessionId for quick lookup when clients report by chatId
    // A single session can now be associated with multiple chatIds (multiple tabs)
    this.chatToSession = new Map();
    this.defaultTTL = 1000 * 60 * 60; // 1 hour fallback
    // cleanupInterval is stored in minutes for admin/settings clarity. Internally
    // we convert to milliseconds when creating timers. Default: 1 minute.
    this.cleanupIntervalMinutes = 1; // minutes
    this.cleanupInterval = this.cleanupIntervalMinutes * 60 * 1000; // internal ms
    this.maxSessions = 1000; // default capacity fallback
    // default rate limit applied to new sessions unless overridden (fallback)
    this.defaultRateLimit = { capacity: 60, refillPerSec: 1 };
    this.authenticatedRateLimit = { capacity: 100, refillPerSec: 5 };
    // Track anonymous session creation attempts to prevent churn abuse
    // Map verified fingerprintKey -> sessionId to ensure one session per fingerprint
    this.fingerprintToSession = new Map();
    // persistence mode cache
    this._persistence = { value: 'memory', ts: 0 };
    // NOTE: settings will be read live from SettingsService when needed.
    // start cleanup timer with defaults
    this._startCleanup();
  }

  // Check if session management is enabled via settings
  isManagementEnabled() {
    try {
      const enabled = SettingsService.get('session.managementEnabled');
      return enabled !== 'false';
    } catch (e) {
      return true; // Default to enabled if setting cannot be read
    }
  }

  // No settings caching helpers: SettingsService values must be read live where needed.
  _applyTTL(ttlMinutesValue) {
    try {
      const ttlNum = Number(ttlMinutesValue);
      if (!Number.isNaN(ttlNum) && ttlNum > 0) {
        this.defaultTTL = ttlNum * 60 * 1000;
      }
    } catch (e) {
      // ignore and keep default
    }
  }

  _restartCleanupTimer(ms) {
    try {
      clearInterval(this.cleanupTimer);
    } catch (e) { }
    this.cleanupInterval = ms;
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

  // configure accepts cleanupIntervalMinutes (preferred) for human-friendly units,
  // but also accepts cleanupIntervalMs for backward compatibility.
  configure({ defaultTTLMs, maxSessions, cleanupIntervalMinutes, cleanupIntervalMs } = {}) {
    if (defaultTTLMs) this.defaultTTL = defaultTTLMs;
    if (maxSessions) this.maxSessions = maxSessions;
    let newIntervalMs = null;
    if (typeof cleanupIntervalMinutes !== 'undefined' && cleanupIntervalMinutes !== null) {
      // convert minutes -> ms
      this.cleanupIntervalMinutes = Number(cleanupIntervalMinutes) || this.cleanupIntervalMinutes;
      newIntervalMs = this.cleanupIntervalMinutes * 60 * 1000;
    } else if (typeof cleanupIntervalMs !== 'undefined' && cleanupIntervalMs !== null) {
      // backward compat: accept ms directly
      newIntervalMs = Number(cleanupIntervalMs) || null;
      // also derive minutes for reporting (rounded)
      if (newIntervalMs) this.cleanupIntervalMinutes = Math.round(newIntervalMs / 60000);
    }

    if (newIntervalMs) {
      clearInterval(this.cleanupTimer);
      this.cleanupInterval = newIntervalMs;
      this._startCleanup();
    }
  }

  async _isMongoMode() {
    try {
      const v = SettingsService.get('session.persistence');
      const norm = (v || '').toString().trim().toLowerCase();
      return norm === 'mongo';
    } catch (e) {
      return false;
    }
  }

  async _saveSessionToDB(session) {
    try {
      await dbConnect();
      const doc = {
        sessionId: session.sessionId,
        chatIds: session.chatIds || [],
        createdAt: new Date(session.createdAt || Date.now()),
        lastSeen: new Date(session.lastSeen || Date.now()),
        ttl: session.ttl,
        isAuthenticated: !!session.isAuthenticated,
        bucket: {
          capacity: session.bucket?.capacity ?? this.defaultRateLimit.capacity,
          credits: typeof session.bucket?.credits === 'number' ? session.bucket.credits : (session.bucket?.capacity ?? this.defaultRateLimit.capacity),
          refillPerSec: session.bucket?.refillPerSec ?? this.defaultRateLimit.refillPerSec,
          lastRefill: new Date(session.bucket?.lastRefill || Date.now())
        },
        requestCount: session.requestCount || 0,
        errorCount: session.errorCount || 0,
        totalLatencyMs: session.totalLatencyMs || 0,
        lastLatencyMs: session.lastLatencyMs || 0,
        requestTimestamps: (session.requestTimestamps || []).map(ts => new Date(ts)),
        errorTypes: session.errorTypes || {},
        chatMetrics: session.chatMetrics || {}
      };
      await SessionState.findOneAndUpdate({ sessionId: session.sessionId }, doc, { upsert: true, setDefaultsOnInsert: true });
    } catch (e) {
      // best-effort persistence
    }
  }

  _hydrateBucket(bucketSrc, isAuthenticated) {
    const cap = Number(bucketSrc?.capacity) || this.defaultRateLimit.capacity;
    const refill = Number(bucketSrc?.refillPerSec) || this.defaultRateLimit.refillPerSec;
    const b = new CreditBucket({ capacity: cap, refillPerSec: refill, isAuthenticated: !!isAuthenticated });
    if (typeof bucketSrc?.credits === 'number') b.credits = bucketSrc.credits;
    if (bucketSrc?.lastRefill) b.lastRefill = new Date(bucketSrc.lastRefill).getTime();
    return b;
  }

  async _loadSessionFromDBBySessionId(sessionId) {
    try {
      await dbConnect();
      const s = await SessionState.findOne({ sessionId }).lean();
      if (!s) return null;
      const sess = {
        sessionId: s.sessionId,
        chatIds: s.chatIds || [],
        createdAt: (s.createdAt ? new Date(s.createdAt).getTime() : Date.now()),
        lastSeen: (s.lastSeen ? new Date(s.lastSeen).getTime() : Date.now()),
        ttl: s.ttl || this.defaultTTL,
        bucket: this._hydrateBucket(s.bucket, s.isAuthenticated),
        isAuthenticated: !!s.isAuthenticated,
        requestCount: s.requestCount || 0,
        errorCount: s.errorCount || 0,
        totalLatencyMs: s.totalLatencyMs || 0,
        lastLatencyMs: s.lastLatencyMs || 0,
        requestTimestamps: (s.requestTimestamps || []).map(d => new Date(d).getTime()),
        errorTypes: s.errorTypes || {},
        chatMetrics: s.chatMetrics || {}
      };
      this.sessions.set(sessionId, sess);
      for (const cid of sess.chatIds) this.chatToSession.set(cid, sessionId);
      return sess;
    } catch (e) {
      return null;
    }
  }

  async _loadSessionFromDBByChatId(chatId) {
    try {
      await dbConnect();
      const s = await SessionState.findOne({ chatIds: chatId }).lean();
      if (!s) return null;
      return this._loadSessionFromDBBySessionId(s.sessionId);
    } catch (e) {
      return null;
    }
  }

  // Return true if there is capacity to create a new session based on the
  // `session.maxActiveSessions` setting. If the setting is empty/null, treat
  // it as unlimited (sessionAvailable = true). If the setting is a number,
  // compute (maxActiveSessions - currentSessions) > 0.
  sessionsAvailable() {
    try {
      const maxVal = SettingsService.get('session.maxActiveSessions');
      // Empty string or null => unlimited
      if (maxVal === '' || maxVal === null || typeof maxVal === 'undefined') {
        return true;
      }
      const max = Number(maxVal);
      if (Number.isNaN(max)) {
        // Fall back to configured maxSessions property
        return this.sessions.size < this.maxSessions;
      }
      return (max - this.sessions.size) > 0;
    } catch (e) {
      if (console && console.error) console.error('sessionsAvailable check failed', e);
      return false;
    }
  }

  async hasCapacity() {
    // Delegate to sessionsAvailable which reads `session.maxActiveSessions`
    // live from SettingsService.
    return this.sessionsAvailable();
  }

  // fingerprintKey: optional HMACed fingerprint. When provided it should be pre-verified by middleware
  // (i.e., the server has validated the raw client fingerprint and issued a signed cookie).
  // fingerprint creation counters removed; session creation is now driven by
  // fingerprint->session mapping. No canCreateSession helper exists anymore.

  async register(sessionId, opts = {}) {
    // sessionId: primary key for sessions. opts may include { chatId, ttlMs, rateLimit, fingerprintKey, isAuthenticated, generateChatId }
    const { chatId: providedChatId, ttlMs: explicitTtlMs, rateLimit: explicitRateLimit, fingerprintKey, isAuthenticated, generateChatId } = opts || {};
    if (!sessionId) throw new Error('sessionId required');

    // Require a verified fingerprintKey to create or reuse sessions.
    if (!fingerprintKey) {
      return { ok: false, reason: 'fingerprintRequired' };
    }

    // If this fingerprint already maps to an active session, reuse it instead
    const existing = this.fingerprintToSession.get(fingerprintKey);
    if (existing) {
      // If the fingerprint maps to a sessionId different from the provided
      // sessionId (i.e. mismatch), treat the mapping as stale and remove it.
      if (existing !== sessionId) {
        try {
          this.fingerprintToSession.delete(fingerprintKey);
        } catch (e) { }
      } else {
        const sess = this.sessions.get(existing);
        if (sess) {
          // update lastSeen and return existing session
          this._touchSession(sess);
          // ensure provided chatId is tracked
          let activeChatId = providedChatId;
          if (generateChatId && !activeChatId) {
            activeChatId = uuidv4();
          }

          if (activeChatId) this._ensureChatMapped(sess, activeChatId, existing);
          return { ok: true, session: sess, chatId: activeChatId };
        }
        // stale mapping: fall through and create a new session
      }
    }

    // Synchronous Capacity Check
    if (!this.sessionsAvailable() && !this.sessions.has(sessionId)) {
      return { ok: false, reason: 'capacity' };
    }

    const now = Date.now();
    // Determine TTL
    let ttl = (typeof explicitTtlMs !== 'undefined' && explicitTtlMs !== null) ? explicitTtlMs : this.defaultTTL;
    const ttlMinutesVal = SettingsService.get('session.defaultTTLMinutes');
    const ttlM = (typeof ttlMinutesVal !== 'undefined' && ttlMinutesVal !== null && ttlMinutesVal !== '') ? Number(ttlMinutesVal) : null;
    if ((explicitTtlMs === undefined || explicitTtlMs === null) && ttlM !== null && !Number.isNaN(ttlM) && ttlM > 0) {
      ttl = ttlM * 60 * 1000;
    }

    let session = this.sessions.get(sessionId);
    if (!session) {
      // If in Mongo mode, try to load the session from DB before creating a new one
      if (await this._isMongoMode()) {
        session = await this._loadSessionFromDBBySessionId(sessionId);
        if (session) {
          // Session was loaded from DB, update fingerprint mapping and touch it
          if (fingerprintKey) {
            try {
              this.fingerprintToSession.set(fingerprintKey, sessionId);
            } catch (e) { }
          }
          this._touchSession(session, now, ttl);

          // Ensure provided chatId is tracked
          let activeChatId = providedChatId;
          if (generateChatId && !activeChatId) {
            activeChatId = uuidv4();
          }
          if (activeChatId) this._ensureChatMapped(session, activeChatId, sessionId);

          // Persist updated session back to DB
          await this._saveSessionToDB(session);
          return { ok: true, session, chatId: activeChatId };
        }
      }

      // Session doesn't exist in memory or DB, create a new one
      // Create token bucket
      let rl = explicitRateLimit || this._getRateLimitFromSettings(!!isAuthenticated);
      if (!rl) {
        rl = isAuthenticated ? { ...this.authenticatedRateLimit } : { ...this.defaultRateLimit };
      }

      const bucket = this._createBucket(rl || this.defaultRateLimit, !!isAuthenticated);

      let initialChatIds = [];
      let activeChatId = providedChatId;
      if (generateChatId && !activeChatId) {
        activeChatId = uuidv4();
      }
      if (activeChatId) initialChatIds.push(activeChatId);

      session = {
        sessionId,
        chatIds: initialChatIds,
        createdAt: now,
        lastSeen: now,
        ttl,
        bucket,
        isAuthenticated: !!isAuthenticated,
        requestCount: 0,
        errorCount: 0,
        totalLatencyMs: 0,
        lastLatencyMs: 0,
        requestTimestamps: [],
        errorTypes: {},
        chatMetrics: {}
      };

      // ATOMIC INSERTION
      this.sessions.set(sessionId, session);

      // map fingerprint -> sessionId
      if (fingerprintKey) {
        try {
          this.fingerprintToSession.set(fingerprintKey, sessionId);
        } catch (e) { }
      }
      if (providedChatId) this._ensureChatMapped(session, providedChatId, sessionId);
      if (activeChatId && activeChatId !== providedChatId) this._ensureChatMapped(session, activeChatId, sessionId);
    } else {
      // If session exists but is now authenticated (and wasn't before), upgrade the bucket
      if (!session.isAuthenticated && isAuthenticated) {
        session.isAuthenticated = true;
        session.bucket.isAuthenticated = true;
        // Re-fetch authenticated rate limits
        let rl = explicitRateLimit || this._getRateLimitFromSettings(true);
        if (!rl) rl = { ...this.authenticatedRateLimit };

        // Update bucket parameters
        if (rl.capacity) {
          session.bucket.capacity = rl.capacity;
          // Optionally boost credits to match new capacity immediately or let them refill?
          // Let's just cap them at new capacity for now.
          if (session.bucket.credits > session.bucket.capacity) {
            session.bucket.credits = session.bucket.capacity;
          }
        }
        if (rl.refillPerSec) {
          session.bucket.refillPerSec = rl.refillPerSec;
        }
      }
      this._touchSession(session, now, ttl);
    }

    // If there's a provided chatId for an existing session, ensure it's tracked
    let activeChatId = providedChatId;
    if (generateChatId && !activeChatId) {
      activeChatId = uuidv4();
    }

    if (session && activeChatId) {
      this._ensureChatMapped(session, activeChatId, sessionId);
    }

    // persist to DB if configured (async, outside critical section)
    if (await this._isMongoMode()) {
      await this._saveSessionToDB(session);
    }
    return { ok: true, session, chatId: activeChatId };
  }

  // Read rate limit values from SettingsService based on authentication status.
  // When preferAuthenticated is true, read only authenticated-specific keys.
  // When preferAuthenticated is false, read only generic keys.
  // Returns an object like { capacity, refillPerSec } if any values found, otherwise null.
  // If settings are not configured, returns null so register() can apply defaults.
  _getRateLimitFromSettings(preferAuthenticated = false) {
    try {
      const capKey = preferAuthenticated ? 'session.authenticatedRateLimitCapacity' : 'session.rateLimitCapacity';
      const refillKey = preferAuthenticated ? 'session.authenticatedRateLimitRefillPerSec' : 'session.rateLimitRefillPerSec';

      const capVal = SettingsService.get(capKey);
      const refillVal = SettingsService.get(refillKey);

      const cap = (typeof capVal !== 'undefined' && capVal !== null && capVal !== '') ? Number(capVal) : null;
      const refill = (typeof refillVal !== 'undefined' && refillVal !== null && refillVal !== '') ? Number(refillVal) : null;

      const out = {};
      if (!Number.isNaN(cap) && cap > 0) out.capacity = cap;
      if (!Number.isNaN(refill) && refill >= 0) out.refillPerSec = refill;
      return Object.keys(out).length ? out : null;
    } catch (e) {
      return null;
    }
  }


  getCurrentSettings() {
    // Read live values from SettingsService where available. Fall back to
    // the in-memory defaults if the setting is absent or malformed.
    try {
      const ttlMinutesVal = SettingsService.get('session.defaultTTLMinutes');
      const cleanupMinutesVal = SettingsService.get('session.cleanupIntervalMinutes');
      const rateLimitCapVal = SettingsService.get('session.rateLimitCapacity');
      const rateLimitRefillVal = SettingsService.get('session.rateLimitRefillPerSec');
      const maxActiveVal = SettingsService.get('session.maxActiveSessions');

      const defaultTTLMs = (typeof ttlMinutesVal !== 'undefined' && ttlMinutesVal !== null && ttlMinutesVal !== '') ? Number(ttlMinutesVal) * 60 * 1000 : this.defaultTTL;
      const cleanupIntervalMinutes = (typeof cleanupMinutesVal !== 'undefined' && cleanupMinutesVal !== null && cleanupMinutesVal !== '') ? Number(cleanupMinutesVal) : this.cleanupIntervalMinutes;
      const cleanupIntervalMs = cleanupIntervalMinutes * 60 * 1000;
      const rateLimit = {
        capacity: (!Number.isNaN(Number(rateLimitCapVal)) && rateLimitCapVal !== null && rateLimitCapVal !== '') ? Number(rateLimitCapVal) : this.defaultRateLimit.capacity,
        refillPerSec: (!Number.isNaN(Number(rateLimitRefillVal)) && rateLimitRefillVal !== null && rateLimitRefillVal !== '') ? Number(rateLimitRefillVal) : this.defaultRateLimit.refillPerSec
      };

      const authRateLimitCapVal = SettingsService.get('session.authenticatedRateLimitCapacity');
      const authRateLimitRefillVal = SettingsService.get('session.authenticatedRateLimitRefillPerSec');
      const authenticatedRateLimit = {
        capacity: (!Number.isNaN(Number(authRateLimitCapVal)) && authRateLimitCapVal !== null && authRateLimitCapVal !== '') ? Number(authRateLimitCapVal) : this.authenticatedRateLimit.capacity,
        refillPerSec: (!Number.isNaN(Number(authRateLimitRefillVal)) && authRateLimitRefillVal !== null && authRateLimitRefillVal !== '') ? Number(authRateLimitRefillVal) : this.authenticatedRateLimit.refillPerSec
      };

      let maxSessions = this.maxSessions;
      if (typeof maxActiveVal !== 'undefined' && maxActiveVal !== null && maxActiveVal !== '') {
        const n = Number(maxActiveVal);
        if (!Number.isNaN(n)) maxSessions = n;
      }

      return {
        defaultTTLMs,
        cleanupIntervalMinutes,
        cleanupIntervalMs,
        cleanupIntervalMs,
        rateLimit,
        authenticatedRateLimit,
        maxSessions
      };
    } catch (e) {
      if (console && console.error) console.error('getCurrentSettings failed', e);
      return {
        defaultTTLMs: this.defaultTTL,
        cleanupIntervalMinutes: this.cleanupIntervalMinutes,
        cleanupIntervalMs: this.cleanupInterval,
        rateLimit: this.defaultRateLimit,
        authenticatedRateLimit: this.authenticatedRateLimit,
        maxSessions: this.maxSessions
      };
    }
  }



  async touch(chatId) {
    const session = await this.getInfo(chatId);
    if (!session) return false;
    session.lastSeen = Date.now();
    if (await this._isMongoMode()) await this._saveSessionToDB(session);
    return true;
  }

  recordRequest(chatId, { latencyMs = 0, error = false, errorType = null } = {}) {
    // Determine whether `chatId` is actually a sessionId or a chatId. If it's
    // a chatId we will update both the session-level aggregates and the
    // per-chat metrics for that chatId. If it's a sessionId, only update the
    // session-level aggregates.
    if (!chatId) return false;
    let session = null;
    let resolvedChatId = null;
    if (this.sessions.has(chatId)) {
      session = this.sessions.get(chatId);
    } else {
      const mapped = this.chatToSession.get(chatId);
      if (mapped) {
        session = this.sessions.get(mapped) || null;
        resolvedChatId = chatId;
      }
    }
    if (!session) return false;

    // Update session-level aggregates
    session.requestCount = (session.requestCount || 0) + 1;
    if (error) session.errorCount = (session.errorCount || 0) + 1;
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

      // Also update per-chat metrics when we have a resolved chatId
      if (resolvedChatId) {
        session.chatMetrics = session.chatMetrics || {};
        const cm = session.chatMetrics[resolvedChatId] = session.chatMetrics[resolvedChatId] || {
          requestCount: 0,
          errorCount: 0,
          totalLatencyMs: 0,
          lastLatencyMs: 0,
          requestTimestamps: [],
          errorTypes: {}
        };
        cm.requestCount = (cm.requestCount || 0) + 1;
        if (error) cm.errorCount = (cm.errorCount || 0) + 1;
        if (errorType) cm.errorTypes = cm.errorTypes || {}, cm.errorTypes[errorType] = (cm.errorTypes[errorType] || 0) + 1;
        if (typeof latencyMs === 'number' && latencyMs >= 0) {
          cm.lastLatencyMs = latencyMs;
          cm.totalLatencyMs = (cm.totalLatencyMs || 0) + latencyMs;
        }
        cm.requestTimestamps.push(now);
        // prune
        let j = 0;
        while (j < cm.requestTimestamps.length && cm.requestTimestamps[j] < pruneBefore) j++;
        if (j > 0) cm.requestTimestamps.splice(0, j);
      }
    } catch (e) {
      // ignore timestamp recording errors
    }
    return true;
  }

  getSummary() {
    const out = [];
    for (const [k, v] of this.sessions.entries()) {
      const chatIds = (v.chatIds && v.chatIds.length) ? v.chatIds : [v.chatId || null];
      for (const cid of chatIds) {
        // Prefer per-chat metrics when available, otherwise fall back to
        // session-level aggregates. This ensures summaries are accurate for
        // individual chats while retaining session-wide visibility.
        const cm = (v.chatMetrics && cid && v.chatMetrics[cid]) ? v.chatMetrics[cid] : null;
        const requestCount = cm ? (cm.requestCount || 0) : (v.requestCount || 0);
        const errorCount = cm ? (cm.errorCount || 0) : (v.errorCount || 0);
        const lastLatencyMs = cm ? (cm.lastLatencyMs || 0) : (v.lastLatencyMs || 0);
        const avgLatencyMs = cm ? (cm.requestCount ? Math.round((cm.totalLatencyMs || 0) / cm.requestCount) : 0) : (v.requestCount ? Math.round((v.totalLatencyMs || 0) / v.requestCount) : 0);
        const errorTypes = cm ? (cm.errorTypes || {}) : (v.errorTypes || {});
        const requestTimestamps = cm ? (cm.requestTimestamps || []) : (v.requestTimestamps || []);

        out.push({
          // Return explicit `sessionId` and `chatId` fields. Do NOT alias them.
          sessionId: k,
          chatId: cid || null,
          creditsLeft: v.bucket ? Math.round(v.bucket.getCredits()) : 0,
          createdAt: v.createdAt,
          lastSeen: v.lastSeen,
          ttl: v.ttl,
          requestCount: requestCount,
          errorCount: errorCount,
          // expose per-error-type counts and an "other" bucket
          errorTypes: errorTypes,
          errorTypesOther: (() => {
            try {
              const byType = errorTypes || {};
              const sumSpecific = Object.values(byType).reduce((a, b) => a + b, 0);
              const other = (errorCount || 0) - sumSpecific;
              return other > 0 ? other : 0;
            } catch (e) {
              return 0;
            }
          })(),
          lastLatencyMs: lastLatencyMs || 0,
          avgLatencyMs: avgLatencyMs,
          // requests per minute: count of requests in the last 60 seconds
          rpm: (() => {
            try {
              const now = Date.now();
              const mts = requestTimestamps || [];
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
    }
    return out;
  }

  async unregister(chatId) {
    // Accept either a sessionId (remove entire session) or a chatId (remove only that mapping)
    if (!chatId) return false;

    // If chatId is actually a sessionId key, delete entire session and its mappings
    if (this.sessions.has(chatId)) {
      const session = this.sessions.get(chatId);
      if (session.chatIds && session.chatIds.length) {
        for (const cid of session.chatIds) this.chatToSession.delete(cid);
      }
      const deleted = this.sessions.delete(chatId);
      if (await this._isMongoMode()) {
        try { await dbConnect(); await SessionState.deleteOne({ sessionId: chatId }); } catch (e) { }
      }
      return deleted;
    }

    // Otherwise treat the input as a chatId -> remove that mapping from the session
    const mappedSessionId = this.chatToSession.get(chatId);
    if (!mappedSessionId) return false;
    const session = this.sessions.get(mappedSessionId);
    // remove the mapping
    this.chatToSession.delete(chatId);
    if (session && session.chatIds && session.chatIds.length) {
      // remove the chatId from the session's chatIds array
      session.chatIds = session.chatIds.filter(c => c !== chatId);
    }
    // If no chatIds remain, remove the whole session
    if (!session || !session.chatIds || session.chatIds.length === 0) {
      // also remove any fingerprint -> session mapping(s) that reference this session
      try {
        for (const [k, v] of this.fingerprintToSession.entries()) {
          if (v === mappedSessionId) this.fingerprintToSession.delete(k);
        }
      } catch (e) { }
      const deleted = this.sessions.delete(mappedSessionId);
      if (await this._isMongoMode()) {
        try { await dbConnect(); await SessionState.deleteOne({ sessionId: mappedSessionId }); } catch (e) { }
      }
      return deleted;
    }
    if (await this._isMongoMode()) await this._saveSessionToDB(session);
    return true;
  }

  // Check and consume credits from the session's bucket. Returns {ok, remaining}.
  // Accepts either a sessionId or a chatId. Prefer direct sessionId lookup
  // to avoid accidentally resolving a sessionId via chat mappings.
  async canConsume(id, credits = 1) {
    if (!id) return { ok: false, reason: 'no_session' };
    // Prefer direct session lookup
    let session = null;
    if (this.sessions.has(id)) {
      session = this.sessions.get(id);
    } else {
      // Fallback: treat id as chatId and map to session
      const mapped = this.chatToSession.get(id);
      if (mapped) session = this.sessions.get(mapped) || null;
      if (!session && (await this._isMongoMode())) {
        // Try to hydrate from DB
        session = await this._loadSessionFromDBBySessionId(id);
        if (!session) session = await this._loadSessionFromDBByChatId(id);
      }
    }

    if (!session) return { ok: false, reason: 'no_session' };
    const allowed = session.bucket.consume(credits);
    if (await this._isMongoMode()) await this._saveSessionToDB(session);
    if (allowed) {
      return { ok: true, remaining: session.bucket.getCredits() };
    }
    // not enough credits
    return { ok: false, reason: 'noCredits', remaining: session.bucket.getCredits() };
  }

  async getInfo(chatId) {
    // Accept either a sessionId or a chatId. Prefer sessionId lookup for speed.
    if (!chatId) return null;
    if (this.sessions.has(chatId)) return this.sessions.get(chatId);
    const mapped = this.chatToSession.get(chatId);
    if (mapped) return this.sessions.get(mapped) || null;
    if (await this._isMongoMode()) {
      let session = await this._loadSessionFromDBBySessionId(chatId);
      if (!session) session = await this._loadSessionFromDBByChatId(chatId);
      return session;
    }
    return null;
  }

  shutdown() {
    clearInterval(this.cleanupTimer);
    this.sessions.clear();
    this.fingerprintToSession.clear();
  }

  _createBucket({ capacity = null, refillPerSec = null } = {}, isAuthenticated = false) {
    const cap = (capacity !== null && !Number.isNaN(Number(capacity))) ? Number(capacity) : this.defaultRateLimit.capacity;
    const refill = (refillPerSec !== null && !Number.isNaN(Number(refillPerSec))) ? Number(refillPerSec) : this.defaultRateLimit.refillPerSec;
    return new CreditBucket({ capacity: cap, refillPerSec: refill, isAuthenticated });
  }

  _touchSession(session, now = Date.now(), ttl = undefined) {
    if (!session) return;
    session.lastSeen = now;
    if (typeof ttl !== 'undefined' && ttl !== null) session.ttl = ttl;
  }

  _ensureChatMapped(session, chatId, fallbackSessionId = null) {
    if (!session || !chatId) return;
    session.chatIds = session.chatIds || [];
    if (!session.chatIds.includes(chatId)) session.chatIds.push(chatId);
    const sid = session.sessionId || fallbackSessionId || null;
    if (sid) this.chatToSession.set(chatId, sid);
    // initialize per-chat metrics when a new chat is mapped
    try {
      session.chatMetrics = session.chatMetrics || {};
      if (!session.chatMetrics[chatId]) {
        session.chatMetrics[chatId] = {
          requestCount: 0,
          errorCount: 0,
          totalLatencyMs: 0,
          lastLatencyMs: 0,
          requestTimestamps: [],
          errorTypes: {}
        };
      }
    } catch (e) { /* best-effort */ }
  }
}

// windowed fingerprint counters removed — no prototype helpers remain

const singleton = new SessionManagementService();
export default singleton;
