import { SettingsService } from './SettingsService.js';
import { SessionState } from '../models/sessionState.js';
import dbConnect from '../api/db/db-connect.js';
import ChatSessionMetricsService from './ChatSessionMetricsService.js';

class ChatSessionService {
    constructor() {
        this.defaultTTL = 1000 * 60 * 10; 
        this._refreshSettings();
    }

    async _refreshSettings() {
        try {
            const ttlSetting = SettingsService.get('session.defaultTTLMinutes');
            const ttlMinutes = Number(ttlSetting);
            const minutes = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 10;
            this.defaultTTL = minutes * 60 * 1000;
        } catch (e) { }
    }

    async _isMongoMode() {
        try {
            const v = SettingsService.get('session.type') || process.env.SESSION_TYPE || process.env.SESSION_STORE || process.env.SESSION_TYPE;
            const norm = (v || '').toString().trim().toLowerCase();
            return norm === 'mongodb' || norm === 'mongo';
        } catch (e) {
            return false;
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

    async getActiveSessionsCount() {
        // If session persistence is configured to use Mongo, query the
        // `SessionState` collection for sessions that have at least one chatId.
        // Otherwise (memory session store) fall back to the in-memory metrics
        // buffer size which tracks active sessions for reporting purposes.
        try {
            if (await this._isMongoMode()) {
                await dbConnect();
                return await SessionState.countDocuments({ chatIds: { $exists: true, $not: { $size: 0 } } });
            }
        } catch (e) {
            // If DB mode fails, fall through to buffer fallback
            console.error('Error counting active sessions (mongo path)', e);
        }

        try {
            return ChatSessionMetricsService.metricsBuffer.size;
        } catch (e) {
            console.error('Error counting active sessions (buffer fallback)', e);
            return null;
        }
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

    shutdown() { }
}

export default new ChatSessionService();
