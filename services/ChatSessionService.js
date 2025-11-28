import SettingsService from './SettingsService.js';
import { SessionState } from '../models/sessionState.js';
import dbConnect from '../api/db/db-connect.js';
import ChatSessionMetricsService from './ChatSessionMetricsService.js';

class ChatSessionService {
  constructor() {
    this.defaultTTL = 1000 * 60 * 60; // fallback 1 hour
    this._refreshSettings();
  }

  async _refreshSettings() {
    try {
      const ttlSetting = SettingsService.get('session.defaultTTLMinutes');
      const ttlMinutes = Number(ttlSetting);
      const minutes = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 60;
      this.defaultTTL = minutes * 60 * 1000;
    } catch (e) { }
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

  async getActiveSessionsCount() {
    // Count documents in SessionState where lastSeen > now - TTL.
    try {
        await dbConnect();
        const ttl = this.defaultTTL;
        const cutoff = new Date(Date.now() - ttl);
        return await SessionState.countDocuments({ lastSeen: { $gt: cutoff } });
    } catch (e) {
        console.error('Error counting active sessions', e);
        // Fallback to metrics buffer size
        return ChatSessionMetricsService.metricsBuffer.size;
    }
  }


  // Deprecated/Redirected methods
  async syncSession(session, sessionId) {
      // No-op: express-session handles state
  }
  
  async registerChat(sessionId, opts) {
      // Deprecated: logic moved to chat-session.js
      return { ok: true, session: { chatIds: [] }, chatId: opts.chatId };
  }
  
  recordRequest(chatId, data) { 
      return ChatSessionMetricsService.recordRequest(chatId, data);
  }
  
  async getSummary() { 
      return ChatSessionMetricsService.getSummary(); 
  }
  
  async unregister(chatId) { 
      return true; 
  }
  
  async getInfo(chatId) { 
      return null; 
  }
  
  shutdown() {}
}

export default new ChatSessionService();
