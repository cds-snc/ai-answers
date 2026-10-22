import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../canadaCaPassages.js', () => ({
    retrievePassages: vi.fn(),
}));

const { retrievePassages } = await import('../canadaCaPassages.js');
const { createRetrievePassagesTool, runRetrievePassages } = await import('../retrievePassages.js');

const CRA_URL = 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/rrsp-options-when-you-turn-71.html';

const ok = (passages) => ({ ok: true, status: 200, passages });

describe('retrievePassages tool', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        retrievePassages.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('formats passages with title, URL and date', async () => {
        retrievePassages.mockResolvedValue(ok([
            { text: 'You must convert your RRSP by the end of the year you turn 71.', title: 'RRSP options', url: CRA_URL, dateModified: '2025-11-19T00:00:00Z', score: 0.2 },
        ]));

        const text = await runRetrievePassages({ query: 'Can I contribute to an RRSP at 72?', url: CRA_URL, lang: 'en' });

        expect(text).toContain('Passage 1: RRSP options');
        expect(text).toContain(`URL: ${CRA_URL}`);
        expect(text).toContain('Date modified: 2025-11-19');
        expect(text).toContain('end of the year you turn 71');
    });

    it('asks for 3 passages, in the language of the page URL', async () => {
        retrievePassages.mockResolvedValue(ok([]));
        const frUrl = 'https://www.canada.ca/fr/agence-revenu/services/impot.html';

        await runRetrievePassages({ query: 'question', url: frUrl, lang: 'en' });

        expect(retrievePassages).toHaveBeenCalledWith({ query: 'question', url: frUrl, lang: 'fr', maxPassages: 3 });
    });

    it('uses the batch language in open mode', async () => {
        retrievePassages.mockResolvedValue(ok([]));

        await runRetrievePassages({ query: 'question', lang: 'fr' });

        expect(retrievePassages).toHaveBeenCalledWith({ query: 'question', url: undefined, lang: 'fr', maxPassages: 3 });
    });

    it('treats an empty URL as open mode', async () => {
        retrievePassages.mockResolvedValue(ok([]));

        const text = await runRetrievePassages({ query: 'question', url: '', lang: 'en' });

        expect(retrievePassages.mock.calls[0][0].url).toBeUndefined();
        expect(text).toBe('No passages found for this query. Use downloadWebPage on a page from the search results.');
    });

    it('says to download the page when page mode finds nothing', async () => {
        retrievePassages.mockResolvedValue(ok([]));

        const text = await runRetrievePassages({ query: 'question', url: CRA_URL, lang: 'en' });

        expect(text).toContain(`No passages found on ${CRA_URL}`);
        expect(text).toContain('Use downloadWebPage to read it.');
    });

    it('says passages are CRA-only for an out-of-scope URL', async () => {
        retrievePassages.mockResolvedValue({ ok: false, reason: 'out_of_scope', status: null, passages: [] });
        const url = 'https://www.canada.ca/en/immigration-refugees-citizenship.html';

        const text = await runRetrievePassages({ query: 'question', url, lang: 'en' });

        expect(text).toBe(`Passages are only available for canada.ca CRA pages. Use downloadWebPage to read ${url}.`);
    });

    it('returns readable text instead of throwing on failure', async () => {
        retrievePassages.mockResolvedValue({ ok: false, reason: 'timeout', status: null, passages: [] });
        expect(await runRetrievePassages({ query: 'question', lang: 'en' }))
            .toBe('Passage retrieval is unavailable right now. Use downloadWebPage instead.');

        retrievePassages.mockRejectedValue(new TypeError('query must be a non-empty string'));
        expect(await runRetrievePassages({ query: ' ', lang: 'en' }))
            .toBe('Passage retrieval is unavailable right now. Use downloadWebPage instead.');
    });

    it('retries a 429 twice, then gives up', async () => {
        vi.useFakeTimers();
        retrievePassages.mockResolvedValue({ ok: false, reason: 'http_error', status: 429, passages: [] });

        const pending = runRetrievePassages({ query: 'question', lang: 'en' });
        await vi.runAllTimersAsync();

        expect(await pending).toBe('Passage retrieval is unavailable right now. Use downloadWebPage instead.');
        expect(retrievePassages).toHaveBeenCalledTimes(3);
    });

    it('stops retrying once a call succeeds', async () => {
        vi.useFakeTimers();
        retrievePassages
            .mockResolvedValueOnce({ ok: false, reason: 'http_error', status: 429, passages: [] })
            .mockResolvedValueOnce(ok([{ text: 'Answer', title: 'T', url: CRA_URL, dateModified: null }]));

        const pending = runRetrievePassages({ query: 'question', lang: 'en' });
        await vi.runAllTimersAsync();

        expect(await pending).toContain('Answer');
        expect(retrievePassages).toHaveBeenCalledTimes(2);
    });

    it('builds a LangChain tool named retrievePassages', async () => {
        retrievePassages.mockResolvedValue(ok([]));
        const passageTool = createRetrievePassagesTool({ lang: 'en' });

        expect(passageTool.name).toBe('retrievePassages');
        await passageTool.invoke({ query: 'question', url: CRA_URL });
        expect(retrievePassages).toHaveBeenCalledWith(expect.objectContaining({ query: 'question', url: CRA_URL }));
    });

    it('rejects an unknown language', () => {
        expect(() => createRetrievePassagesTool({ lang: 'es' })).toThrow(TypeError);
    });
});
