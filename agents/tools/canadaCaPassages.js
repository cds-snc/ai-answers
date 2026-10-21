import { maskSecretValue } from './utils/searchUtils.js';

// Client for the Coveo Passage Retrieval (CPR) API on the Canada.ca Coveo org.
// Phase 1 of docs/plans/coveo-passage-retrieval.md: the admin passage test page
// calls this directly, and the retrievePassages tool will wrap it later, so both
// exercise the same request.
//
// No retries on purpose: the test page measures latency per call, and a hidden
// retry would blur it. Revisit when this becomes an agent tool.

const PASSAGES_PATH = '/rest/search/v3/passages/retrieve';
const PASSAGES_REQUEST_TIMEOUT_MS = 15000;
export const MAX_PASSAGES_LIMIT = 20;

// The trial covers CRA only. Coveo scopes CRA content by its "legalname" metadata, not by
// URL, and that includes the services-level tax pages (Coveo engineer, see the plan).
const CRA_HOSTNAME = 'www.canada.ca';
const CRA_PATH_PREFIXES = ['/en/revenue-agency/', '/fr/agence-revenu/', '/en/services/taxes/', '/fr/services/impots/'];

const SEARCH_PAGES = {
    en: {
        searchPageUrl: 'https://www.canada.ca/en/revenue-agency/search.html',
        searchPageRelativeUrl: '/en/revenue-agency/search.html',
    },
    // As in Coveo's French example. The pipeline condition matches on the URL containing
    // /fr/agence-revenu/, which is what scopes the search to CRA.
    fr: {
        searchPageUrl: 'https://www.canada.ca/fr/agence-revenu/',
        searchPageRelativeUrl: '/fr/agence-revenu/search.html',
    },
};

const ADDITIONAL_FIELDS = ['clickableuri', 'title', 'datemodified', 'dateissued'];

/**
 * The passages endpoint is on the same Coveo org host as standard search, so it is
 * built from CANADA_CA_SEARCH_URI rather than a new env var (previews already have it).
 * @returns {string} the passages URL
 * @throws if CANADA_CA_SEARCH_URI is missing or isn't a Coveo org URL
 */
export function getPassagesEndpoint() {
    const searchUri = process.env.CANADA_CA_SEARCH_URI;
    if (!searchUri) {
        throw new Error('CANADA_CA_SEARCH_URI is not set');
    }
    const { protocol, hostname, origin } = new URL(searchUri);
    if (protocol !== 'https:' || !hostname.endsWith('.org.coveo.com')) {
        throw new Error(`CANADA_CA_SEARCH_URI host is not a Coveo org (${hostname})`);
    }
    return `${origin}${PASSAGES_PATH}`;
}

/**
 * @param {string} url
 * @returns {boolean} true for a canada.ca CRA page
 */
export function isCraUrl(url) {
    try {
        const { protocol, hostname, pathname } = new URL(url);
        return protocol === 'https:'
            && hostname === CRA_HOSTNAME
            && CRA_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    } catch {
        return false;
    }
}

/**
 * Builds the request body, starting from the URL-filter example the Canada.ca search
 * team sent (see the plan's API notes). Change one setting at a time.
 * @param {{ query: string, url?: string, lang: 'en'|'fr', maxPassages: number }} params
 */
export function buildPassagesRequest({ query, url, lang, maxPassages }) {
    if (typeof query !== 'string' || !query.trim()) {
        throw new TypeError('query must be a non-empty string');
    }
    if (lang !== 'en' && lang !== 'fr') {
        throw new TypeError(`lang must be 'en' or 'fr', got ${lang}`);
    }
    if (!Number.isInteger(maxPassages) || maxPassages < 1 || maxPassages > MAX_PASSAGES_LIMIT) {
        throw new TypeError(`maxPassages must be an integer from 1 to ${MAX_PASSAGES_LIMIT}`);
    }

    const body = {
        query: query.trim(),
        localization: { locale: lang, timezone: 'America/Montreal' },
        context: {
            // Turns on the Semantic Encoder, which passage retrieval needs. Never drop it.
            customContext: 'globalSemantic',
            ...SEARCH_PAGES[lang],
        },
        pipeline: 'Canada public websites - Generic - customContext',
        searchhub: 'canada-gouv-public-websites',
        locale: lang,
        additionalFields: ADDITIONAL_FIELDS,
        maxPassages,
    };
    if (url) {
        // Exact match on the indexed URL, so drop any #anchor or ?query from the citation.
        // href is normalized and percent-encodes any quote, so it can't break out of the string.
        const pageUrl = new URL(url);
        pageUrl.hash = '';
        pageUrl.search = '';
        body.filter = `@clickableuri==${JSON.stringify(pageUrl.href)}`;
    }
    return body;
}

/**
 * Maps a Passages V3 response to the fields the test page and tool use.
 * @returns {Array<{ text: string, score: number|null, url: string, title: string, dateModified: unknown }>|null}
 *   null when the response has no `items` array (an unexpected shape).
 */
export function extractPassages(response) {
    if (!Array.isArray(response?.items)) return null;
    return response.items.map((item) => ({
        text: item.text ?? '',
        score: typeof item.relevanceScore === 'number' ? item.relevanceScore : null,
        url: item.document?.clickableuri ?? '',
        title: item.document?.title ?? '',
        dateModified: item.document?.datemodified ?? null,
    }));
}

/**
 * One call to the passages endpoint. Never throws: every outcome comes back as a
 * result with `ok` and, on failure, a `reason` code.
 * @param {object} requestBody
 */
export async function sendPassagesRequest(requestBody) {
    const base = { requestBody, status: null, latencyMs: null, response: null, passages: [] };

    let endpoint;
    try {
        endpoint = getPassagesEndpoint();
    } catch (error) {
        return { ...base, ok: false, reason: 'not_configured', detail: error.message };
    }
    if (!process.env.CANADA_CA_SEARCH_API_KEY) {
        return { ...base, ok: false, reason: 'not_configured', detail: 'CANADA_CA_SEARCH_API_KEY is not set' };
    }

    const started = Date.now();
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            signal: AbortSignal.timeout(PASSAGES_REQUEST_TIMEOUT_MS),
            headers: {
                Authorization: `Bearer ${process.env.CANADA_CA_SEARCH_API_KEY}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'User-Agent': process.env.USER_AGENT || 'ai-answers',
            },
            body: JSON.stringify(requestBody),
        });
        const text = await response.text();
        const latencyMs = Date.now() - started;
        let json = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }

        if (!response.ok) {
            const detail = maskSecretValue(text);
            console.error('Passage retrieval HTTP error:', { status: response.status, body: detail });
            return { ...base, ok: false, reason: 'http_error', status: response.status, latencyMs, response: json, detail };
        }

        const passages = extractPassages(json);
        if (!passages) {
            return { ...base, ok: false, reason: 'unexpected_response', status: response.status, latencyMs, response: json };
        }
        return { ...base, ok: true, status: response.status, latencyMs, response: json, passages };
    } catch (error) {
        const latencyMs = Date.now() - started;
        const reason = error?.name === 'TimeoutError' ? 'timeout' : 'network_error';
        const detail = maskSecretValue(error?.message);
        console.error('Passage retrieval failed:', { reason, detail });
        return { ...base, ok: false, reason, latencyMs, detail };
    }
}

/**
 * Passages for a question, optionally limited to one CRA page.
 * A non-CRA URL returns `reason: 'out_of_scope'` without calling Coveo.
 * @param {{ query: string, url?: string, lang: 'en'|'fr', maxPassages: number }} params
 */
export async function retrievePassages({ query, url, lang, maxPassages }) {
    if (url && !isCraUrl(url)) {
        return { ok: false, reason: 'out_of_scope', requestBody: null, status: null, latencyMs: null, response: null, passages: [] };
    }
    return sendPassagesRequest(buildPassagesRequest({ query, url, lang, maxPassages }));
}
