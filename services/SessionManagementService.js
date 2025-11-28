// In-memory session manager
// Features:
// - track sessions by chatId
// - touch session to extend TTL
// - capacity limit (max concurrent sessions)
// - metrics aggregation
import { v4 as uuidv4 } from 'uuid';
import { SettingsService } from './SettingsService.js';
import dbConnect from '../api/db/db-connect.js';
import { SessionState } from '../models/sessionState.js';
import { rateLimiters } from '../middleware/rate-limiter.js';

class SessionManagementService {
  constructor() {
    // Map sessionId -> { sessionId, chatIds, createdAt, lastSeen, ttl, ... }
    this.sessions = new Map();
    // Map chatId -> sessionId for quick lookup
    this.chatToSession = new Map();
    // defaultTTL and cleanup interval will be loaded from SettingsService
    this.defaultTTL = 1000 * 60 * 60; // fallback 1 hour
    this.cleanupInterval = 60 * 1000; // fallback 60s
    this.maxSessions = 1000;

    // persistence mode cache
    this._persistence = { value: 'memory', ts: 0 };

    // Initialize settings-driven values and start cleanup timer
    this._refreshSettings();
    this._startCleanup();
  }

  // Read session-related settings from SettingsService cache and apply them.
  async _refreshSettings() {
    try {
      const ttlSetting = SettingsService.get('session.defaultTTLMinutes');
      const ttlMinutes = Number(ttlSetting);
      const minutes = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 60;
      const newTTL = minutes * 60 * 1000;
      this.defaultTTL = newTTL;

      const cleanupSetting = SettingsService.get('session.cleanupIntervalSeconds');
      const cleanupSeconds = Number(cleanupSetting);
      const secs = Number.isFinite(cleanupSeconds) && cleanupSeconds > 0 ? cleanupSeconds : 60;
      const newCleanupInterval = secs * 1000;
      // If the cleanup interval changed, restart the cleanup timer
      if (this.cleanupInterval !== newCleanupInterval) {
        this.cleanupInterval = newCleanupInterval;
        if (this.cleanupTimer) {
          clearInterval(this.cleanupTimer);
          this.cleanupTimer = null;
        }
        this._startCleanup();
      }
    } catch (e) {
      // best-effort: keep previous values on error
    }
  }

  isManagementEnabled() {
    try {
      const enabled = SettingsService.get('session.managementEnabled');
      return enabled !== 'false';
    } catch (e) {
      return true;
    }
  }

  async sessionsAvailable() {
    if (!this.isManagementEnabled()) return true;
    const maxSessionsSetting = SettingsService.get('session.maxActiveSessions');
    if (maxSessionsSetting === null || maxSessionsSetting === undefined || maxSessionsSetting === '') {
      return true;
    }

    const max = parseInt(maxSessionsSetting, 10);
    if (isNaN(max)) return true;

    const activeCount = await this.getActiveSessionsCount();
    if (activeCount === null) return true; // error reading count, treat as available
    return activeCount < max;
  }

  // Returns the number of active sessions (sessions with at least one chatId).
  // Abstracts storage mode so callers don't need to branch on memory vs mongo.
  async getActiveSessionsCount() {
    try {
      if (await this._isMongoMode()) {
        await dbConnect();
        // count documents where chatIds array exists and has at least one element
        return await SessionState.countDocuments({ chatIds: { $exists: true, $not: { $size: 0 } } });
      }
    } catch (e) {
      // If DB mode fails for some reason, fall back to in-memory count
      try {
        let count = 0;
        for (const s of this.sessions.values()) {
          if (s && Array.isArray(s.chatIds) && s.chatIds.length > 0) count++;
        }
        return count;
      } catch (e2) {
        console.error('[SessionManagementService] getActiveSessionsCount error', e, e2);
        return null;
      }
    }

    // Memory mode
    try {
      let count = 0;
      for (const s of this.sessions.values()) {
        if (s && Array.isArray(s.chatIds) && s.chatIds.length > 0) count++;
      }
      return count;
    } catch (e) {
      console.error('[SessionManagementService] getActiveSessionsCount error', e);
      return null;
    }
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



  // Syncs in-memory state with the express-session object
  async syncSession(expressSession, sessionId) {
    if (!expressSession || !sessionId) return;

    // Refresh settings so TTL and cleanup interval can be changed at runtime
    await this._refreshSettings();
    const now = Date.now();
    let session = this.sessions.get(sessionId);

    if (!session) {
      // Try to load from DB first to recover metrics
      if (await this._isMongoMode()) {
        session = await this._loadSessionFromDBBySessionId(sessionId);
      }

      if (!session) {
        // Create new in-memory session record
        session = {
          sessionId,
          chatIds: expressSession.chatIds || [],
          createdAt: now,
          lastSeen: now,
          ttl: this.defaultTTL,
          isAuthenticated: !!expressSession.user,
          requestCount: 0,
          errorCount: 0,
          totalLatencyMs: 0,
          lastLatencyMs: 0,
          requestTimestamps: [],
          errorTypes: {},
          chatMetrics: {}
        };
      }
      this.sessions.set(sessionId, session);
    } else {
      // Update existing
      session.lastSeen = now;
      session.isAuthenticated = !!expressSession.user;
      if (expressSession.chatIds) {
        session.chatIds = expressSession.chatIds;
      }
    }

    // Update chat mappings
    if (session.chatIds) {
      for (const cid of session.chatIds) {
        this.chatToSession.set(cid, sessionId);
      }
    }

    // Persist to DB if needed (for dashboard visibility)
    if (await this._isMongoMode()) {
      await this._saveSessionToDB(session);
    }
  }

  // Renamed from register to registerChat to be more explicit
  // This is called when a new chat is created or an existing one is accessed
  async registerChat(sessionId, opts = {}) {
    const { chatId: providedChatId, generateChatId } = opts || {};
    if (!sessionId) throw new Error('sessionId required');

    // Ensure settings are current before creating/registering chats
    await this._refreshSettings();
    let session = this.sessions.get(sessionId);

    // If not in memory, try to load from DB or wait for syncSession to handle it.
    if (!session) {
      if (await this._isMongoMode()) {
        session = await this._loadSessionFromDBBySessionId(sessionId);
      }

      if (!session) {
        // Fallback: create a temporary one
        session = {
          sessionId,
          chatIds: [],
          createdAt: Date.now(),
          lastSeen: Date.now(),
          ttl: this.defaultTTL,
          isAuthenticated: false // will be updated by sync
        };
      }
      this.sessions.set(sessionId, session);
    }

    let activeChatId = providedChatId;
    if (generateChatId && !activeChatId) {
      activeChatId = uuidv4();
    }

    // If this register call would create the first chat for this session,
    // enforce the global "max active sessions" limit (only counts sessions
    // that have at least one chatId). If the limit is reached, return a
    // failure so callers can surface a friendly message.
    try {
      const hasAnyChats = !!(session.chatIds && session.chatIds.length > 0);
      const willCreateFirstChat = !hasAnyChats && (!!activeChatId);
      if (willCreateFirstChat) {
        const avail = await this.sessionsAvailable();
        if (!avail) {
          return { ok: false, reason: 'sessions_full' };
        }
      }
    } catch (e) {
      // On errors checking availability, prefer to allow creation rather
      // than block — treat availability check as best-effort.
    }

    if (activeChatId) {
      if (!session.chatIds) session.chatIds = [];
      if (!session.chatIds.includes(activeChatId)) {
        session.chatIds.push(activeChatId);
      }
      this.chatToSession.set(activeChatId, sessionId);

      // Initialize metrics for this chat
      session.chatMetrics = session.chatMetrics || {};
      if (!session.chatMetrics[activeChatId]) {
        session.chatMetrics[activeChatId] = {
          requestCount: 0,
          errorCount: 0,
          totalLatencyMs: 0,
          lastLatencyMs: 0,
          requestTimestamps: [],
          errorTypes: {}
        };
      }
    }

    if (await this._isMongoMode()) {
      await this._saveSessionToDB(session);
    }

    return { ok: true, session, chatId: activeChatId };
  }

  recordRequest(chatId, { latencyMs = 0, error = false, errorType = null } = {}) {
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

    // RPM timestamps
    try {
      const now = Date.now();
      session.requestTimestamps = session.requestTimestamps || [];
      session.requestTimestamps.push(now);
      const pruneBefore = now - (5 * 60 * 1000);
      let i = 0;
      while (i < session.requestTimestamps.length && session.requestTimestamps[i] < pruneBefore) i++;
      if (i > 0) session.requestTimestamps.splice(0, i);

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
        let j = 0;
        while (j < cm.requestTimestamps.length && cm.requestTimestamps[j] < pruneBefore) j++;
        if (j > 0) cm.requestTimestamps.splice(0, j);
      }
    } catch (e) { }
    return true;
  }

  async getSummary() {
    const out = [];
    for (const [k, v] of this.sessions.entries()) {
      const chatIds = (v.chatIds && v.chatIds.length) ? v.chatIds : [v.chatId || null];

      // Fetch rate limit info
      let creditsLeft = 0;
      const limiter = v.isAuthenticated ? rateLimiters.auth : rateLimiters.public;
      if (limiter) {
        try {
          const res = await limiter.get(k); // k is sessionId
          if (res) {
            creditsLeft = res.remainingPoints;
          } else {
            // If no record, they have full points? Or 0?
            // RateLimiterFlexible usually returns null if key not found (meaning full points if not consumed yet)
            // But we can just default to "unknown" or max.
            // For dashboard, let's try to get the points from options if possible, or just 0.
            creditsLeft = limiter.points;
          }
        } catch (e) { }
      }

      for (const cid of chatIds) {
        const cm = (v.chatMetrics && cid && v.chatMetrics[cid]) ? v.chatMetrics[cid] : null;
        const requestCount = cm ? (cm.requestCount || 0) : (v.requestCount || 0);
        const errorCount = cm ? (cm.errorCount || 0) : (v.errorCount || 0);
        const lastLatencyMs = cm ? (cm.lastLatencyMs || 0) : (v.lastLatencyMs || 0);
        const avgLatencyMs = cm ? (cm.requestCount ? Math.round((cm.totalLatencyMs || 0) / cm.requestCount) : 0) : (v.requestCount ? Math.round((v.totalLatencyMs || 0) / v.requestCount) : 0);
        const errorTypes = cm ? (cm.errorTypes || {}) : (v.errorTypes || {});
        const requestTimestamps = cm ? (cm.requestTimestamps || []) : (v.requestTimestamps || []);

        out.push({
          sessionId: k,
          chatId: cid || null,
          creditsLeft: creditsLeft,
          createdAt: v.createdAt,
          lastSeen: v.lastSeen,
          ttl: v.ttl,
          requestCount: requestCount,
          errorCount: errorCount,
          errorTypes: errorTypes,
          errorTypesOther: (() => {
            try {
              const byType = errorTypes || {};
              const sumSpecific = Object.values(byType).reduce((a, b) => a + b, 0);
              const other = (errorCount || 0) - sumSpecific;
              return other > 0 ? other : 0;
            } catch (e) { return 0; }
          })(),
          lastLatencyMs: lastLatencyMs || 0,
          avgLatencyMs: avgLatencyMs,
          rpm: (() => {
            try {
              const now = Date.now();
              const mts = requestTimestamps || [];
              let count = 0;
              for (let i = mts.length - 1; i >= 0; i--) {
                if (now - mts[i] <= 60 * 1000) count++; else break;
              }
              return count;
            } catch (e) { return 0; }
          })()
        });
      }
    }
    return out;
  }

  async unregister(chatId) {
    if (!chatId) return false;
    if (this.sessions.has(chatId)) {
      const session = this.sessions.get(chatId);
      if (session.chatIds) {
        for (const cid of session.chatIds) this.chatToSession.delete(cid);
      }
      const deleted = this.sessions.delete(chatId);
      if (await this._isMongoMode()) {
        try { await dbConnect(); await SessionState.deleteOne({ sessionId: chatId }); } catch (e) { }
      }
      return deleted;
    }

    const mappedSessionId = this.chatToSession.get(chatId);
    if (!mappedSessionId) return false;
    const session = this.sessions.get(mappedSessionId);
    this.chatToSession.delete(chatId);
    if (session && session.chatIds) {
      session.chatIds = session.chatIds.filter(c => c !== chatId);
    }
    if (!session || !session.chatIds || session.chatIds.length === 0) {
      const deleted = this.sessions.delete(mappedSessionId);
      if (await this._isMongoMode()) {
        try { await dbConnect(); await SessionState.deleteOne({ sessionId: mappedSessionId }); } catch (e) { }
      }
      return deleted;
    }
    if (await this._isMongoMode()) await this._saveSessionToDB(session);
    return true;
  }

  async getInfo(chatId) {
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

  async _loadSessionFromDBBySessionId(sessionId) {
    try {
      await dbConnect();
      const s = await SessionState.findOne({ sessionId }).lean();
      if (!s) return null;
      // Hydrate simple object
      const sess = {
        sessionId: s.sessionId,
        chatIds: s.chatIds || [],
        createdAt: (s.createdAt ? new Date(s.createdAt).getTime() : Date.now()),
        lastSeen: (s.lastSeen ? new Date(s.lastSeen).getTime() : Date.now()),
        ttl: s.ttl || this.defaultTTL,
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
    } catch (e) { return null; }
  }

  async _loadSessionFromDBByChatId(chatId) {
    try {
      await dbConnect();
      const s = await SessionState.findOne({ chatIds: chatId }).lean();
      if (!s) return null;
      return this._loadSessionFromDBBySessionId(s.sessionId);
    } catch (e) { return null; }
  }

  shutdown() {
    clearInterval(this.cleanupTimer);
    this.sessions.clear();
  }
}

const singleton = new SessionManagementService();
export default singleton;
