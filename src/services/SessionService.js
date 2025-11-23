import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';


const SessionService = {
  async getSessionMetrics() {
    const url = getApiUrl('chat-session-metrics');
    const resp = await AuthService.fetchWithAuth(url, {
      headers: { Accept: 'application/json' }
    });
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
      await AuthService.fetchWithAuth(url, {
        method: 'POST',
        // Ensure cookies / session token are sent so the server can map chatId -> session
        body: JSON.stringify({ chatId, latencyMs, error, errorType })
      });
    } catch (e) {
      // swallow - non-fatal client-side telemetry
      if (console && console.error) console.error('SessionService.report failed', e);
    }
  },

  /**
   * Returns true when the public site status is 'available' AND there is at least one session available.
   * Returns false on any error or when either condition is not met.
   */
  async isAvailable() {
    try {
      // Use the availability endpoint via apiToUrl so the dev proxy and overrides work
      const url = getApiUrl('chat-session-availability');
      const resp = await fetch(url);
      if (!resp.ok) return false;
      const data = await resp.json();
      // expects { siteStatus: boolean, sessionAvailable: boolean }
      return Boolean(data.siteStatus) && Boolean(data.sessionAvailable);
    } catch (e) {
      if (console && console.error) console.error('SessionService.isAvailable failed', e);
      return false;
    }
  }
};

export default SessionService;
