import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    buildPassagesRequest,
    isPageUrl,
    retrievePassages,
    sendPassagesRequest,
} from '../canadaCaPassages.js';

const CRA_URL = 'https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/p148.html';

const passagesResponse = {
    items: [{
        text: 'You can file an objection within 90 days.',
        relevanceScore: 0.82,
        document: { clickableuri: CRA_URL, title: 'P148', datemodified: 1700000000000 },
    }],
};

const okResponse = (body = passagesResponse) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
});

describe('canadaCaPassages', () => {
    let fetchMock;

    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        process.env.CANADA_CA_SEARCH_API_KEY = 'secret-key';
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('isPageUrl', () => {
        it.each([
            [CRA_URL, true],
            ['https://www.canada.ca/en/services/benefits/calendar.html', true],
            ['https://ircc.canada.ca/english/helpcentre/index.html', true],
            ['http://www.canada.ca/en/revenue-agency/services.html', false],
            ['not a url', false],
        ])('%s → %s', (url, expected) => {
            expect(isPageUrl(url)).toBe(expected);
        });
    });

    describe('buildPassagesRequest', () => {
        it('always sends globalSemantic, and has no filter in open mode', () => {
            const body = buildPassagesRequest({ query: 'how do i appeal?', lang: 'en', maxPassages: 5 });
            expect(body.context.customContext).toBe('globalSemantic');
            expect(body.context.searchPageRelativeUrl).toBe('/en/sr/srb.html');
            expect(body.locale).toBe('en');
            expect(body.maxPassages).toBe(5);
            expect(body).not.toHaveProperty('filter');
        });

        it('filters on clickableuri in page mode', () => {
            const body = buildPassagesRequest({ query: 'q', url: CRA_URL, lang: 'en', maxPassages: 20 });
            expect(body.filter).toBe(`@clickableuri=="${CRA_URL}"`);
        });

        it('drops the anchor and query from the page URL, since the filter is an exact match', () => {
            const body = buildPassagesRequest({ query: 'q', url: `${CRA_URL}?wbdisable=true#section2`, lang: 'en', maxPassages: 5 });
            expect(body.filter).toBe(`@clickableuri=="${CRA_URL}"`);
        });

        it('uses the French search page for French', () => {
            const body = buildPassagesRequest({ query: 'q', lang: 'fr', maxPassages: 5 });
            expect(body.localization.locale).toBe('fr');
            expect(body.context.customContext).toBe('globalSemantic');
            expect(body.context.searchPageRelativeUrl).toBe('/fr/sr/srb.html');
        });

        it.each([
            [{ query: '', lang: 'en', maxPassages: 5 }],
            [{ query: 'q', lang: 'de', maxPassages: 5 }],
            [{ query: 'q', lang: 'en', maxPassages: 0 }],
            [{ query: 'q', lang: 'en', maxPassages: 21 }],
        ])('rejects bad input %j', (params) => {
            expect(() => buildPassagesRequest(params)).toThrow(TypeError);
        });
    });

    describe('retrievePassages', () => {
        it('returns mapped passages with the request body, status and latency', async () => {
            fetchMock.mockResolvedValue(okResponse());
            const result = await retrievePassages({ query: 'appeal', url: CRA_URL, lang: 'en', maxPassages: 5 });

            expect(result.ok).toBe(true);
            expect(result.status).toBe(200);
            expect(typeof result.latencyMs).toBe('number');
            expect(result.requestBody.filter).toContain(CRA_URL);
            expect(result.passages).toEqual([{
                text: 'You can file an objection within 90 days.',
                score: 0.82,
                url: CRA_URL,
                title: 'P148',
                dateModified: 1700000000000,
            }]);

            const [endpoint, init] = fetchMock.mock.calls[0];
            expect(endpoint).toBe('https://employmentandsocialdevelopmentcanadaproduction3vn562uw.org.coveo.com/rest/search/v3/passages/retrieve');
            expect(init.headers.Authorization).toBe('Bearer secret-key');
        });

        it('sends a non-CRA page URL to Coveo', async () => {
            fetchMock.mockResolvedValue(okResponse());
            const url = 'https://www.canada.ca/en/services/benefits/calendar.html';
            const result = await retrievePassages({ query: 'q', url, lang: 'en', maxPassages: 5 });
            expect(result.requestBody.filter).toBe(`@clickableuri=="${url}"`);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('refuses a URL that is not https without calling Coveo', async () => {
            const result = await retrievePassages({ query: 'q', url: 'not a url', lang: 'en', maxPassages: 5 });
            expect(result).toMatchObject({ ok: false, reason: 'invalid_url', passages: [] });
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('sendPassagesRequest failures', () => {
        it('returns http_error with the masked body', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 401,
                text: async () => '{"message":"bad token Bearer secret-key"}',
            });
            const result = await sendPassagesRequest({ query: 'q' });
            expect(result).toMatchObject({ ok: false, reason: 'http_error', status: 401, passages: [] });
            expect(result.detail).not.toContain('secret-key');
        });

        it('returns timeout when the request times out', async () => {
            fetchMock.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
            const result = await sendPassagesRequest({ query: 'q' });
            expect(result).toMatchObject({ ok: false, reason: 'timeout', passages: [] });
        });

        it('returns network_error on a transport failure', async () => {
            fetchMock.mockRejectedValue(new TypeError('fetch failed'));
            const result = await sendPassagesRequest({ query: 'q' });
            expect(result).toMatchObject({ ok: false, reason: 'network_error', passages: [] });
        });

        it('returns unexpected_response when there is no items array', async () => {
            fetchMock.mockResolvedValue(okResponse({ results: [] }));
            const result = await sendPassagesRequest({ query: 'q' });
            expect(result).toMatchObject({ ok: false, reason: 'unexpected_response', status: 200 });
            expect(result.response).toEqual({ results: [] });
        });

        it('returns not_configured without calling Coveo when the key is unset', async () => {
            delete process.env.CANADA_CA_SEARCH_API_KEY;
            const result = await sendPassagesRequest({ query: 'q' });
            expect(result).toMatchObject({ ok: false, reason: 'not_configured' });
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });
});
