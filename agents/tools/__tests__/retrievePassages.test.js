import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../canadaCaPassages.js', () => ({
    retrievePassages: vi.fn(),
}));

vi.mock('../../../services/ServerLoggingService.js', () => ({
    default: { info: vi.fn() },
}));

const { retrievePassages } = await import('../canadaCaPassages.js');
const { default: ServerLoggingService } = await import('../../../services/ServerLoggingService.js');
const { createRetrievePassagesTool, runRetrievePassages } = await import('../retrievePassages.js');

const CRA_URL = 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/rrsp-options-when-you-turn-71.html';

const ok = (passages) => ({ ok: true, status: 200, passages });

describe('retrievePassages tool', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        retrievePassages.mockReset();
        ServerLoggingService.info.mockReset();
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

    it('removes text a later passage repeats from an earlier passage of the same page', async () => {
        retrievePassages.mockResolvedValue(ok([
            { text: '# Notices\n\nIntro paragraph.\n\nRRSP deduction limit.', title: 'NOA', url: CRA_URL, dateModified: null },
            { text: 'Intro paragraph.\n\nRRSP deduction limit.\n\nYou have 90 days to object.', title: 'NOA', url: CRA_URL, dateModified: null },
        ]));

        const text = await runRetrievePassages({ query: 'question', url: CRA_URL, lang: 'en' });
        const second = text.split('---')[1];

        expect(second).toContain('You have 90 days to object.');
        expect(second).not.toContain('Intro paragraph.');
        expect(second).not.toContain('RRSP deduction limit.');
        expect(second).toContain('Text repeated from an earlier passage of this page was removed.');
    });

    it('drops a passage whose text all appears in an earlier passage of the same page', async () => {
        retrievePassages.mockResolvedValue(ok([
            { text: 'First.\n\nSecond.', title: 'A', url: CRA_URL, dateModified: null },
            { text: 'Second.', title: 'A', url: CRA_URL, dateModified: null },
            { text: 'Other page.', title: 'B', url: 'https://www.canada.ca/en/services/taxes.html', dateModified: null },
        ]));

        const text = await runRetrievePassages({ query: 'question', lang: 'en' });

        expect(text).not.toContain('Passage 3');
        expect(text).toContain('Passage 2: B');
    });

    it('keeps text that passages from different pages share', async () => {
        const otherUrl = 'https://www.canada.ca/en/services/taxes.html';
        retrievePassages.mockResolvedValue(ok([
            { text: 'Call 1-800-959-8281.', title: 'A', url: CRA_URL, dateModified: null },
            { text: 'Call 1-800-959-8281.', title: 'B', url: otherUrl, dateModified: null },
        ]));

        const text = await runRetrievePassages({ query: 'question', lang: 'en' });

        expect(text.split('---')[1]).toContain('Call 1-800-959-8281.');
        expect(text).not.toContain('was removed');
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

    it('says to use a search-result URL for an invalid URL', async () => {
        retrievePassages.mockResolvedValue({ ok: false, reason: 'invalid_url', status: null, passages: [] });
        const url = 'www.canada.ca/en.html';

        const text = await runRetrievePassages({ query: 'question', url, lang: 'en' });

        expect(text).toBe(`${url} is not a valid https URL. Use a URL from the search results.`);
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

    it('logs each attempt with its status and latency, for the chat', async () => {
        vi.useFakeTimers();
        retrievePassages
            .mockResolvedValueOnce({ ok: false, reason: 'http_error', status: 429, latencyMs: 640, passages: [] })
            .mockResolvedValueOnce(ok([{ text: 'Answer', title: 'T', url: CRA_URL, dateModified: null }]));

        const pending = runRetrievePassages({ query: 'question', url: CRA_URL, lang: 'en', chatId: 'chat-1' });
        await vi.runAllTimersAsync();
        await pending;

        expect(ServerLoggingService.info).toHaveBeenCalledTimes(2);
        expect(ServerLoggingService.info).toHaveBeenNthCalledWith(1, 'retrievePassages attempt', 'chat-1', {
            attempt: 1, mode: 'page', url: CRA_URL, status: 429, reason: 'http_error', latencyMs: 640, passages: 0,
        });
        expect(ServerLoggingService.info).toHaveBeenNthCalledWith(2, 'retrievePassages attempt', 'chat-1',
            expect.objectContaining({ attempt: 2, status: 200, passages: 1 }));
    });

    it('logs open-mode attempts with no URL', async () => {
        retrievePassages.mockResolvedValue(ok([]));

        await runRetrievePassages({ query: 'question', lang: 'en', chatId: 'chat-1' });

        expect(ServerLoggingService.info).toHaveBeenCalledWith('retrievePassages attempt', 'chat-1',
            expect.objectContaining({ attempt: 1, mode: 'open', url: null }));
    });

    it('builds a LangChain tool named retrievePassages', async () => {
        retrievePassages.mockResolvedValue(ok([]));
        const passageTool = createRetrievePassagesTool({ lang: 'en', chatId: 'chat-1' });

        expect(passageTool.name).toBe('retrievePassages');
        await passageTool.invoke({ query: 'question', url: CRA_URL });
        expect(retrievePassages).toHaveBeenCalledWith(expect.objectContaining({ query: 'question', url: CRA_URL }));
        expect(ServerLoggingService.info).toHaveBeenCalledWith('retrievePassages attempt', 'chat-1', expect.any(Object));
    });

    it('rejects an unknown language', () => {
        expect(() => createRetrievePassagesTool({ lang: 'es' })).toThrow(TypeError);
    });
});
