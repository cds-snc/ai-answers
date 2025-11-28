import { SessionState } from '../models/sessionState.js';
import dbConnect from '../api/db/db-connect.js';

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
    if (!sessionId) return false;

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
    m.lastSeen = Date.now();

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

    return true;
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
      for (const [k, v] of this.metricsBuffer.entries()) {
          out.push({
              sessionId: k,
              requestCount: v.requestCount,
              lastSeen: v.lastSeen,
              chatIds: Array.from(v.chatIds)
          });
      }
      return out;
  }
}

export default new ChatSessionMetricsService();
