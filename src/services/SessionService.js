import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';


const SessionService = {
  async getSessionMetrics() {
    const url = getApiUrl('chat-session-metrics');
    const resp = await AuthService.fetch(url, {
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
      await AuthService.fetch(url, {
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
   * Initializes the chat session atomically.
   * Computes fingerprint and sends it to the server to get a chatId and availability.
   */
  async initChat() {
    let visitorId = null;
    try {
      const FingerprintJSImport = await import('@fingerprintjs/fingerprintjs');
      const FingerprintJS = FingerprintJSImport && FingerprintJSImport.default ? FingerprintJSImport.default : FingerprintJSImport;
      if (FingerprintJS && typeof FingerprintJS.load === 'function') {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        visitorId = result?.visitorId;
      }
    } catch (e) {
      if (console && console.error) console.error('Fingerprint computation failed', e);
    }

    const url = getApiUrl('chat-init');
    const resp = await AuthService.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId })
    });

    if (!resp.ok) {
      throw new Error(`Failed to initialize chat: ${resp.status}`);
    }

    return await resp.json();
  }
};


export default SessionService;
