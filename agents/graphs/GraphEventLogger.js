import ServerLoggingService from '../../services/ServerLoggingService.js';
import { graphRequestContext } from './requestContext.js';

function sanitizeData(data) {
  if (!data || typeof data !== 'object') return data;
  const safe = { ...data };
  // remove common sensitive header keys if present
  delete safe.authorization;
  delete safe.Authorization;
  delete safe.cookie;
  delete safe.Cookie;
  return safe;
}

export async function logGraphEvent(level, message, chatId = 'system', data = {}, opts = {}) {
  // Preserve existing server logging behavior first
  try {
    if (level === 'error') {
      // ServerLoggingService.error signature: (message, chatId, error)
      await ServerLoggingService.error(message, chatId, data);
    } else if (typeof ServerLoggingService[level] === 'function') {
      await ServerLoggingService[level](message, chatId, data);
    } else {
      // fallback to info
      await ServerLoggingService.info(message, chatId, data);
    }
  } catch (e) {
    // Do not let server logging failures break graph execution
    try { console.error('ServerLoggingService logging failure', e); } catch (_) {}
  }

  // Now forward to graph SSE writer if present in the async context
  try {
    const store = graphRequestContext.getStore && graphRequestContext.getStore();
    const writer = store && store.graphEventWriter;
    if (typeof writer === 'function') {
      const payload = {
        level,
        chatId,
        message: typeof message === 'object' ? String(message) : message,
        data: sanitizeData(data)
      };
      try {
        writer('log', payload);
      } catch (err) {
        // swallow writer errors; logging must not break graph run
      }
    }
  } catch (err) {
    // swallow
  }
}

export default { logGraphEvent };
