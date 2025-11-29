import { SessionState } from '../models/sessionState.js';
import dbConnect from '../api/db/db-connect.js';
import { rateLimiters } from '../middleware/rate-limiter.js';

class ChatSessionMetricsService {
  constructor() {
    // Map chatId -> sessionId for quick lookup
    this.chatToSession = new Map();
    
    // Map sessionId -> metrics object
    this.metricsBuffer = new Map();
    
    this.flushInterval = 60 * 1000; // 1 minute
    this._startFlushTimer();
  }

 
  // Called when a chat is created or accessed
  registerChat(sessionId, chatId) {
    if (!sessionId || !chatId) return;
    if (console && console.debug) console.debug('[ChatSessionMetricsService] registerChat', { sessionId, chatId });
    this.chatToSession.set(chatId, sessionId);
    
    // Ensure we have a buffer entry
    if (!this.metricsBuffer.has(sessionId)) {
      this.metricsBuffer.set(sessionId, {
        sessionId,
        chatIds: new Set([chatId]),
        requestCount: 0,
        errorCount: 0,
        totalLatencyMs: 0,
        lastLatencyMs: 0,
        requestTimestamps: [],
        errorTypes: {},
        chatMetrics: {},
        lastSeen: Date.now()
      });
    } else {
      const m = this.metricsBuffer.get(sessionId);
      m.chatIds.add(chatId);
      m.lastSeen = Date.now();
    }
  }

  recordRequest(chatId, { latencyMs = 0, error = false, errorType = null } = {}) {
    const sessionId = this.chatToSession.get(chatId);
    if (!sessionId) {
      if (console && console.debug) console.debug('[ChatSessionMetricsService] recordRequest - unknown chatId', { chatId });
      return false;
    }

    let m = this.metricsBuffer.get(sessionId);
    if (!m) {
      // If not in buffer, create fresh
      m = {
        sessionId,
        chatIds: new Set([chatId]),
        requestCount: 0,
        errorCount: 0,
        totalLatencyMs: 0,
        lastLatencyMs: 0,
        requestTimestamps: [],
        errorTypes: {},
        chatMetrics: {},
        lastSeen: Date.now()
      };
      this.metricsBuffer.set(sessionId, m);
    }

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

  // Expose a small debug helper
  _debugState() {
    return {
      metricsBufferSize: this.metricsBuffer.size,
      chatToSessionSize: this.chatToSession.size
    };
  }

  _startFlushTimer() {
    setInterval(() => this.flushMetrics(), this.flushInterval);
  }

  async flushMetrics() {
    for (const [sessionId, m] of this.metricsBuffer.entries()) {
      try {
        await dbConnect();
        const chatIds = Array.from(m.chatIds);
        
        const doc = {
            sessionId,
            chatIds,
            lastSeen: new Date(m.lastSeen),
            requestCount: m.requestCount,
            errorCount: m.errorCount,
            totalLatencyMs: m.totalLatencyMs,
            lastLatencyMs: m.lastLatencyMs,
            errorTypes: m.errorTypes,
            chatMetrics: m.chatMetrics
        };

        await SessionState.findOneAndUpdate(
          { sessionId }, 
          doc, 
          { upsert: true, setDefaultsOnInsert: true }
        );
        
        // Cleanup old entries from buffer (1 hour idle)
        if (Date.now() - m.lastSeen > (1000 * 60 * 60)) {
           this.metricsBuffer.delete(sessionId);
           for (const cid of chatIds) this.chatToSession.delete(cid);
        }

      } catch (e) {
        console.error('Error flushing metrics', e);
      }
    }
  }
  
  async getSummary() {
      const out = [];
      const now = Date.now();
      // Try to fetch persisted session documents (no bucket, limiter is authoritative)
      const sessionIds = Array.from(this.metricsBuffer.keys());
      let bucketMap = new Map();
      try {
        if (sessionIds.length) {
          await dbConnect();
          const docs = await SessionState.find({ sessionId: { $in: sessionIds } }).select('sessionId createdAt ttl lastSeen isAuthenticated').lean();
          for (const d of docs) bucketMap.set(d.sessionId, d);
        }
      } catch (e) {
        console.error('[ChatSessionMetricsService] getSummary - failed to load session documents', e);
      }
      for (const [sessionId, v] of this.metricsBuffer.entries()) {
        // Determine if session is authenticated (prefer persisted value)
        const persisted = bucketMap.get(sessionId);
        const isAuthenticated = (persisted && typeof persisted.isAuthenticated !== 'undefined') ? persisted.isAuthenticated : (v && v.isAuthenticated) || false;
        // Try to read remaining rate-limiter points for this session as a fallback
        let limiterRemaining = null;
        try {
          limiterRemaining = await (async () => {
            try {
              const limiter = (isAuthenticated && rateLimiters && rateLimiters.auth) ? rateLimiters.auth : (rateLimiters && rateLimiters.public) ? rateLimiters.public : null;
              if (!limiter || typeof limiter.get !== 'function') return null;
              const rec = await limiter.get(sessionId);
              if (!rec) return null;
              if (typeof rec.remainingPoints === 'number') return rec.remainingPoints;
              if (typeof rec.consumedPoints === 'number' && typeof limiter.points === 'number') return Math.max(0, limiter.points - rec.consumedPoints);
              return null;
            } catch (e) { return null; }
          })();
        } catch (e) {
          limiterRemaining = null;
        }
        const chatIds = Array.from(v.chatIds || []);
        // If there are no chatIds, still output a session-level row with null chatId
        if (!chatIds.length) chatIds.push(null);

        for (const cid of chatIds) {
          const cm = (v.chatMetrics && cid && v.chatMetrics[cid]) ? v.chatMetrics[cid] : null;
          const requestCount = cm ? (cm.requestCount || 0) : (v.requestCount || 0);
          const errorCount = cm ? (cm.errorCount || 0) : (v.errorCount || 0);
          const lastLatencyMs = cm ? (cm.lastLatencyMs || 0) : (v.lastLatencyMs || 0);
          const avgLatencyMs = cm ? (cm.requestCount ? Math.round((cm.totalLatencyMs || 0) / cm.requestCount) : 0) : (v.requestCount ? Math.round((v.totalLatencyMs || 0) / v.requestCount) : 0);
          const errorTypes = cm ? (cm.errorTypes || {}) : (v.errorTypes || {});
          const requestTimestamps = cm ? (cm.requestTimestamps || []) : (v.requestTimestamps || []);

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
                // No bucket persisted anymore; fall back to 0 when limiter data is unavailable
                return 0;
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
