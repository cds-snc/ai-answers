import AuthService from '../AuthService.js';
import { getApiUrl } from '../../utils/apiToUrl.js';

async function post(payload) {
    const res = await AuthService.fetch(getApiUrl('experimental-passages-test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const err = new Error(`Passage test request failed: ${res.status} ${res.statusText}`);
        err.status = res.status;
        err.code = errBody?.code;
        throw err;
    }
    return res.json();
}

export const PassagesTestClientService = {
    /**
     * Passages through the server's passage client (as the tool will call it).
     * @param {{ query: string, url?: string, lang: 'en'|'fr', maxPassages: number }} params
     */
    runQuery({ query, url, lang, maxPassages }) {
        return post({ mode: 'client', query, url, lang, maxPassages });
    },

    /** Sends an edited request body as-is; the server adds the Coveo key. */
    runRaw(body) {
        return post({ mode: 'raw', body });
    },
};
