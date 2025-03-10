import { getApiUrl } from '../utils/apiToUrl.js';

// Unified logging service for both client and server-side logging
const LoggingService = {
  async _logToServer(chatId, level, message, metadata = null, emoji = 'ℹ️') {
    // Client-side console logging
    console[level](`${emoji} ${message}`, metadata);

    try {
      await fetch(getApiUrl('db-log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          logLevel: level,
          message: typeof message === 'object' ? JSON.stringify(message) : message,
          metadata,
        }),
      });
    } catch (error) {
      //console.error(`Failed to log ${level}:`, error);
    }
  },

  async info(chatId, message, metadata = null) {
    return this._logToServer(chatId, 'info', message, metadata, 'ℹ️');
  },

  async debug(chatId, message, metadata = null) {
    return this._logToServer(chatId, 'debug', message, metadata, '🔍');
  },

  async warn(chatId, message, metadata = null) {
    return this._logToServer(chatId, 'warn', message, metadata, '⚠️');
  },

  async error(chatId, message, error = null) {
    const metadata = error
      ? {
          error: error?.message || error,
          stack: error?.stack,
        }
      : null;
    return this._logToServer(chatId, 'error', message, metadata, '❌');
  },

  async getLogs(options = {}) {
    try {
      const queryParams = new URLSearchParams({
        ...(options.chatId && { chatId: options.chatId }),
        ...(options.level && { level: options.level }),
      }).toString();

      const response = await fetch(getApiUrl(`db-log?${queryParams}`));
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching logs:', error);
      throw error;
    }
  },
};

export default LoggingService;
