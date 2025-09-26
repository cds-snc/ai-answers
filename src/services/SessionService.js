import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';

const SessionService = {
  async getSessionMetrics() {
    const url = getApiUrl('chat-session-metrics');
    const resp = await fetch(url, { headers: { ...AuthService.getAuthHeader(), Accept: 'application/json' } });
    if (!resp.ok) {
      const txt = await resp.text();
      const err = new Error(`Failed to load sessions: ${resp.status} ${txt}`);
      err.status = resp.status;
      err.text = txt;
      throw err;
    }
    const json = await resp.json();
    return json.sessions || [];
  },

  async report(chatId, latencyMs = 0, error = false, errorType = null) {
    const url = getApiUrl('chat-report');
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AuthService.getAuthHeader() },
        body: JSON.stringify({ chatId, latencyMs, error, errorType })
      });
    } catch (e) {
      // swallow - non-fatal client-side telemetry
      if (console && console.error) console.error('SessionService.report failed', e);
    }
  }
};

export default SessionService;
