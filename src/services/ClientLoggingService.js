import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';

class ClientLoggingService {
  static async logMessage(chatId, message, level = 'info', metadata = {}, emoji = 'ℹ️') {
    // Client-side console logging
    console[level](`${emoji} ${message}`, metadata);

    try {
      // Avoid calling client-only AuthService methods when running in Node/test environments
      let authHeader = {};
      try {
        if (typeof window !== 'undefined') {
          authHeader = AuthService.getAuthHeader();
        }
      } catch (e) {
        // swallow errors from AuthService when localStorage isn't available
        authHeader = {};
      }

      const response = await fetch(getApiUrl('db-log'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader
        },
        body: JSON.stringify({
          chatId,
          logLevel: level,
          message: typeof message === 'object' ? JSON.stringify(message) : message,
          metadata,
        }),
      });
      return response.ok;
    } catch (error) {
      console.error(`Failed to log ${level}:`, error);
      return false;
    }
  }

  static async info(chatId, message, metadata = null) {
    return this.logMessage(chatId, message, 'info', metadata, 'ℹ️');
  }

  static async debug(chatId, message, metadata = null) {
    return this.logMessage(chatId, message, 'debug', metadata, '🔍');
  }

  static async warn(chatId, message, metadata = null) {
    return this.logMessage(chatId, message, 'warn', metadata, '⚠️');
  }

  static async error(chatId, message, error = null) {
    const metadata = error
      ? {
          error: error?.message || error,
          stack: error?.stack,
        }
      : null;
    return this.logMessage(chatId, message, 'error', metadata, '❌');
  }

  static async getLogs(options = {}) {
    try {
      const queryParams = new URLSearchParams({
        ...(options.chatId && { chatId: options.chatId }),
        ...(options.level && { level: options.level }),
      }).toString();

      let authHeader = {};
      try {
        if (typeof window !== 'undefined') {
          authHeader = AuthService.getAuthHeader();
        }
      } catch (e) {
        authHeader = {};
      }
      const response = await fetch(getApiUrl(`db-log?${queryParams}`), {
        headers: authHeader
      });
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching logs:', error);
      throw error;
    }
  }
}

export default ClientLoggingService;
