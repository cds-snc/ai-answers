import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';

let cachedVisitorId = null;

const SessionService = {
  /**
   * Returns the visitor fingerprint, computing it if necessary and caching the result.
   */
  async getVisitorId() {
    if (cachedVisitorId) return cachedVisitorId;

    try {
      const FingerprintJSImport = await import('@fingerprintjs/fingerprintjs');
      const FingerprintJS = FingerprintJSImport && FingerprintJSImport.default ? FingerprintJSImport.default : FingerprintJSImport;
      if (FingerprintJS && typeof FingerprintJS.load === 'function') {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        cachedVisitorId = result?.visitorId;
        return cachedVisitorId;
      }
    } catch (e) {
      if (console && console.error) console.error('Fingerprint computation failed', e);
    }
    return null;
  },
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
  }
};

export default SessionService;
