import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../experimental-passages-test.js';
import { retrievePassages, sendPassagesRequest } from '../../../agents/tools/canadaCaPassages.js';

vi.mock('../../../agents/tools/canadaCaPassages.js', () => ({
    MAX_PASSAGES_LIMIT: 20,
    retrievePassages: vi.fn(async () => ({ ok: true, passages: [] })),
    sendPassagesRequest: vi.fn(async () => ({ ok: true, passages: [] })),
}));

vi.mock('../../../middleware/auth.js', () => ({
    authMiddleware: vi.fn((req, res, next) => next()),
    adminMiddleware: vi.fn((req, res, next) => next()),
    withProtection: vi.fn((handlerFn) => handlerFn),
}));

const CRA_URL = 'https://www.canada.ca/en/revenue-agency/services/x.html';

describe('experimental-passages-test API', () => {
    let res;

    const call = (body, method = 'POST') => handler({ method, body }, res);

    beforeEach(() => {
        vi.clearAllMocks();
        res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    });

    it('runs client mode through retrievePassages', async () => {
        await call({ mode: 'client', query: 'appeal', url: CRA_URL, lang: 'en', maxPassages: 5 });
        expect(retrievePassages).toHaveBeenCalledWith({ query: 'appeal', url: CRA_URL, lang: 'en', maxPassages: 5 });
        expect(res.json).toHaveBeenCalledWith({ ok: true, passages: [] });
    });

    it('treats an empty URL as open mode', async () => {
        await call({ mode: 'client', query: 'appeal', url: '', lang: 'fr', maxPassages: 5 });
        expect(retrievePassages).toHaveBeenCalledWith({ query: 'appeal', url: undefined, lang: 'fr', maxPassages: 5 });
    });

    it('sends raw mode bodies as-is', async () => {
        const body = { query: 'q', context: { customContext: 'globalSemantic' } };
        await call({ mode: 'raw', body });
        expect(sendPassagesRequest).toHaveBeenCalledWith(body);
    });

    it.each([
        [{ mode: 'client', query: '', lang: 'en', maxPassages: 5 }, 'INVALID_QUERY'],
        [{ mode: 'client', query: { $ne: '' }, lang: 'en', maxPassages: 5 }, 'INVALID_QUERY'],
        [{ mode: 'client', query: 'q', url: ['x'], lang: 'en', maxPassages: 5 }, 'INVALID_URL'],
        [{ mode: 'client', query: 'q', lang: 'de', maxPassages: 5 }, 'INVALID_LANG'],
        [{ mode: 'client', query: 'q', lang: 'en', maxPassages: '5' }, 'INVALID_MAX_PASSAGES'],
        [{ mode: 'client', query: 'q', lang: 'en', maxPassages: 21 }, 'INVALID_MAX_PASSAGES'],
        [{ mode: 'raw', body: [1] }, 'INVALID_BODY'],
        [{ mode: 'raw', body: 'q' }, 'INVALID_BODY'],
        [{ mode: 'other' }, 'INVALID_MODE'],
    ])('rejects %j with %s', async (body, code) => {
        await call(body);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ code });
        expect(retrievePassages).not.toHaveBeenCalled();
        expect(sendPassagesRequest).not.toHaveBeenCalled();
    });

    it('returns a 500 code instead of hanging when the client throws', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        retrievePassages.mockRejectedValueOnce(new TypeError('boom'));
        await call({ mode: 'client', query: 'q', lang: 'en', maxPassages: 5 });
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ code: 'SERVER_ERROR' });
    });

    it('rejects non-POST requests', async () => {
        await call({}, 'GET');
        expect(res.status).toHaveBeenCalledWith(405);
    });
});
