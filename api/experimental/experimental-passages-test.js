import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import { MAX_PASSAGES_LIMIT, retrievePassages, sendPassagesRequest } from '../../agents/tools/canadaCaPassages.js';
import { maskSecretValue } from '../../agents/tools/utils/searchUtils.js';

// Admin passage test page (docs/plans/coveo-passage-retrieval.md, Phase 1).
// Client mode goes through the passage client, as the tool will. Raw mode sends an
// edited request body as-is, so request settings can be tried without a redeploy.
// The Coveo key is added on the server either way and never returned.

const MAX_QUERY_LENGTH = 1000;
const MAX_URL_LENGTH = 2000;

function badRequest(res, code) {
    return res.status(400).json({ code });
}

async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        return await runTest(req, res);
    } catch (error) {
        console.error('Passage test failed:', maskSecretValue(error?.message));
        return res.status(500).json({ code: 'SERVER_ERROR' });
    }
}

async function runTest(req, res) {
    const { mode } = req.body || {};

    if (mode === 'client') {
        const { query, url, lang, maxPassages } = req.body;
        if (typeof query !== 'string' || !query.trim() || query.length > MAX_QUERY_LENGTH) {
            return badRequest(res, 'INVALID_QUERY');
        }
        if (url !== undefined && url !== '' && (typeof url !== 'string' || url.length > MAX_URL_LENGTH)) {
            return badRequest(res, 'INVALID_URL');
        }
        if (lang !== 'en' && lang !== 'fr') {
            return badRequest(res, 'INVALID_LANG');
        }
        if (!Number.isInteger(maxPassages) || maxPassages < 1 || maxPassages > MAX_PASSAGES_LIMIT) {
            return badRequest(res, 'INVALID_MAX_PASSAGES');
        }
        const result = await retrievePassages({ query, url: url || undefined, lang, maxPassages });
        return res.json(result);
    }

    if (mode === 'raw') {
        const { body } = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return badRequest(res, 'INVALID_BODY');
        }
        const result = await sendPassagesRequest(body);
        return res.json(result);
    }

    return badRequest(res, 'INVALID_MODE');
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
