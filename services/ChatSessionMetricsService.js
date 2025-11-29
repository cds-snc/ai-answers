import { SessionState } from '../models/sessionState.js';
import dbConnect from '../api/db/db-connect.js';
import { getRateLimiterConfig } from '../middleware/rate-limiter.js';
import { SettingsService } from './SettingsService.js';

class ChatSessionMetricsService {
  constructor() {
    // Map chatId -> sessionId for quick lookup
    this.chatToSession = new Map();
    
    // Map sessionId -> metrics object
    this.metricsBuffer = new Map();
    
    this.flushInterval = 60 * 1000; // 1 minute
    this._startFlushTimer();
  }

  _isMongoMode() {
    try {
        // Check metrics.type first, fall back to session.type
        const v = SettingsService.get('metrics.type') || process.env.METRICS_TYPE || 
                  SettingsService.get('session.type') || process.env.SESSION_TYPE || process.env.SESSION_STORE;
        const norm = (v || '').toString().trim().toLowerCase();
        return norm === 'mongodb' || norm === 'mongo';
    } catch (e) {
        return false;
    }
  }
 
  // Called when a chat is created or accessed
  registerChat(sessionId, chatId) {
    if (!sessionId || !chatId) return;
    if (console && console.debug) console.debug('[ChatSessionMetricsService] registerChat', { sessionId, chatId });
    this.chatToSession.set(chatId, sessionId);
    const m = this._ensureMetricsEntry(sessionId);
    m.chatIds.add(chatId);
    m.chatIds.add(chatId);
    m.lastSeen = Date.now();
  }

  recordRequest(chatId, { latencyMs = 0, error = false, errorType = null } = {}) {
    const sessionId = this.chatToSession.get(chatId);
    if (!sessionId) {
      if (console && console.debug) console.debug('[ChatSessionMetricsService] recordRequest - unknown chatId', { chatId });
      return false;
    }

    const m = this._ensureMetricsEntry(sessionId);

    m.requestCount++;
    if (error) m.errorCount++;
    if (errorType) {
      m.errorTypes[errorType] = (m.errorTypes[errorType] || 0) + 1;
    }
    if (latencyMs >= 0) {
      m.lastLatencyMs = latencyMs;
      m.totalLatencyMs += latencyMs;
    }
    const now = Date.now();
    m.lastSeen = now;

    // RPM timestamps for session
    m.requestTimestamps = m.requestTimestamps || [];
    m.requestTimestamps.push(now);
    const pruneBefore = now - (5 * 60 * 1000);
    let pi = 0;
    while (pi < m.requestTimestamps.length && m.requestTimestamps[pi] < pruneBefore) pi++;
    if (pi > 0) m.requestTimestamps.splice(0, pi);

    // Chat specific metrics
    if (!m.chatMetrics[chatId]) {
      m.chatMetrics[chatId] = {
        requestCount: 0,
        errorCount: 0,
        totalLatencyMs: 0,
        lastLatencyMs: 0,
        errorTypes: {}
      };
    }
    const cm = m.chatMetrics[chatId];
    cm.requestCount++;
    if (error) cm.errorCount++;
    if (errorType) cm.errorTypes[errorType] = (cm.errorTypes[errorType] || 0) + 1;
    if (latencyMs >= 0) {
      cm.lastLatencyMs = latencyMs;
      cm.totalLatencyMs += latencyMs;
    }
    // RPM timestamps for chat-metrics
    cm.requestTimestamps = cm.requestTimestamps || [];
    cm.requestTimestamps.push(now);
    let cj = 0;
    while (cj < cm.requestTimestamps.length && cm.requestTimestamps[cj] < pruneBefore) cj++;
    if (cj > 0) cm.requestTimestamps.splice(0, cj);

    return true;
  }

  recordRateLimiterSnapshot(sessionId, snapshot) {
    if (!sessionId || !snapshot) return;
    const m = this._ensureMetricsEntry(sessionId);
    m.rateLimiterSnapshot = snapshot;
    m.lastSeen = Date.now();
  }

  // Expose a small debug helper
  _debugState() {
    return {
      metricsBufferSize: this.metricsBuffer.size,
      chatToSessionSize: this.chatToSession.size
    };
  }

  _getTTL() {
    try {
        const ttlSetting = SettingsService.get('session.defaultTTLMinutes');
        const ttlMinutes = Number(ttlSetting);
        return (Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 10) * 60 * 1000;
    } catch (e) {
        return 1000 * 60 * 10;
    }
  }

  _startFlushTimer() {
    setInterval(() => this.flushMetrics(), this.flushInterval);
  }

  _createMetricsEntry(sessionId) {
    return {
      sessionId,
      chatIds: new Set(),
      requestCount: 0,
      errorCount: 0,
      totalLatencyMs: 0,
      lastLatencyMs: 0,
      requestTimestamps: [],
      errorTypes: {},
      chatMetrics: {},
      lastSeen: Date.now(),
      rateLimiterSnapshot: null
    };
  }

  _ensureMetricsEntry(sessionId) {
    if (!this.metricsBuffer.has(sessionId)) {
      this.metricsBuffer.set(sessionId, this._createMetricsEntry(sessionId));
    }
    return this.metricsBuffer.get(sessionId);
  }

  async pruneStaleSessions() {
    const ttl = this._getTTL();
    const cleanupThreshold = ttl;
    const now = Date.now();

    // 1. Memory Cleanup (Always run to prevent leaks)
    for (const [sessionId, m] of this.metricsBuffer.entries()) {
        if (now - m.lastSeen > cleanupThreshold) {
           this.metricsBuffer.delete(sessionId);
           const chatIds = Array.from(m.chatIds);
           for (const cid of chatIds) this.chatToSession.delete(cid);
        }
    }

    // 2. Mongo Cleanup (If enabled)
    if (this._isMongoMode()) {
        try {
            await dbConnect();
            // Soft Delete: Mark sessions as 'expired'
            const expirationCutoff = new Date(now - cleanupThreshold);
            await SessionState.updateMany(
                { 
                    lastSeen: { $lt: expirationCutoff },
                    status: { $ne: 'expired' }
                },
                { $set: { status: 'expired' } }
            );
        } catch (e) {
            console.error('Error in session archival/cleanup (mongo)', e);
        }
    }
  }

  async flushMetrics() {
    const useMongo = this._isMongoMode();

    for (const [sessionId, m] of this.metricsBuffer.entries()) {
      try {
        if (useMongo) {
            await dbConnect();
            const chatIds = Array.from(m.chatIds);
            
            const doc = {
                sessionId,
                status: 'active',
                chatIds,
                lastSeen: new Date(m.lastSeen),
                requestCount: m.requestCount,
                errorCount: m.errorCount,
                totalLatencyMs: m.totalLatencyMs,
                lastLatencyMs: m.lastLatencyMs,
                errorTypes: m.errorTypes,
                chatMetrics: m.chatMetrics,
                rateLimiter: m.rateLimiterSnapshot || null
            };

            await SessionState.findOneAndUpdate(
            { sessionId }, 
            doc, 
            { upsert: true, setDefaultsOnInsert: true }
            );
        }
      } catch (e) {
        console.error('Error flushing metrics', e);
      }
    }
    
    // Prune stale sessions after flushing
    await this.pruneStaleSessions();
  }

  async getSummary() {
    const out = [];
    const now = Date.now();
    const limiterConfig = getRateLimiterConfig();
    // Try to fetch persisted session documents (no bucket, limiter is authoritative)
    const sessionIds = Array.from(this.metricsBuffer.keys());
    let bucketMap = new Map();
    try {
      if (sessionIds.length) {
        await dbConnect();
        const docs = await SessionState.find({ sessionId: { $in: sessionIds } }).select('sessionId createdAt ttl lastSeen isAuthenticated rateLimiter').lean();
        for (const d of docs) bucketMap.set(d.sessionId, d);
      }
    } catch (e) {
      console.error('[ChatSessionMetricsService] getSummary - failed to load session documents', e);
    }
    for (const [sessionId, v] of this.metricsBuffer.entries()) {
      // Determine if session is authenticated (prefer persisted value)
      const persisted = bucketMap.get(sessionId);
      const isAuthenticated = (persisted && typeof persisted.isAuthenticated !== 'undefined') ? persisted.isAuthenticated : (v && v.isAuthenticated) || false;
      const sessionLimiterSnapshot = (persisted && persisted.rateLimiter) || (v && v.rateLimiterSnapshot) || null;
      const limiterRemaining = (sessionLimiterSnapshot && typeof sessionLimiterSnapshot.remainingPoints === 'number')
        ? sessionLimiterSnapshot.remainingPoints
        : null;
      const limiterPoints = (sessionLimiterSnapshot && typeof sessionLimiterSnapshot.points === 'number')
        ? sessionLimiterSnapshot.points
        : null;
      const chatIds = Array.from(v.chatIds || []);
      // If there are no chatIds, still output a session-level row with null chatId
      if (!chatIds.length) chatIds.push(null);

      for (const cid of chatIds) {
        const cm = (v.chatMetrics && cid && v.chatMetrics[cid]) ? v.chatMetrics[cid] : null;

        // STRICTLY per-chat metrics. Do not fall back to session totals.
        const requestCount = cm ? (cm.requestCount || 0) : 0;
        const errorCount = cm ? (cm.errorCount || 0) : 0;
        const lastLatencyMs = cm ? (cm.lastLatencyMs || 0) : 0;
        const avgLatencyMs = cm ? (cm.requestCount ? Math.round((cm.totalLatencyMs || 0) / cm.requestCount) : 0) : 0;
        const errorTypes = cm ? (cm.errorTypes || {}) : {};
        const requestTimestamps = cm ? (cm.requestTimestamps || []) : [];

        // rpm: count timestamps in last 60s
        let rpm = 0;
        for (let i = requestTimestamps.length - 1; i >= 0; i--) {
          if (now - requestTimestamps[i] <= 60 * 1000) rpm++; else break;
        }

        out.push({
          sessionId,
          chatId: cid || null,
          // Use rate-limiter remaining points as the authoritative credits source.
          // Fall back to persisted/in-memory bucket only when limiter data is unavailable.
          creditsLeft: (() => {
            try {
              if (typeof limiterRemaining === 'number') return limiterRemaining;
              const configuredCapacity = isAuthenticated ? limiterConfig.authCapacity : limiterConfig.publicCapacity;
              const fallbackCapacity = (typeof limiterPoints === 'number')
                ? limiterPoints
                : (Number.isFinite(configuredCapacity) ? configuredCapacity : 0);
              return Math.max(0, fallbackCapacity);
            } catch (e) { return 0; }
          })(),
          createdAt: (persisted && persisted.createdAt) || v.createdAt || null,
          lastSeen: (persisted && persisted.lastSeen) || v.lastSeen || now,
          ttl: (persisted && persisted.ttl) || v.ttl || null,
          limiterRemaining: typeof limiterRemaining === 'number' ? limiterRemaining : null,
          requestCount,
          errorCount,
          errorTypes,
          errorTypesOther: (() => {
            try {
              const byType = errorTypes || {};
              const sumSpecific = Object.values(byType).reduce((a, b) => a + b, 0);
              const other = (errorCount || 0) - sumSpecific;
              return other > 0 ? other : 0;
            } catch (e) { return 0; }
          })(),
          lastLatencyMs: lastLatencyMs || 0,
          avgLatencyMs,
          rpm
        });
      }
    }
    return out;
  }
}

export default new ChatSessionMetricsService();
