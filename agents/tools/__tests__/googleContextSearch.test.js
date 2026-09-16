import { describe, it, expect, vi, beforeEach } from 'vitest';

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));

vi.mock('googleapis', () => ({
    google: {
        customsearch: vi.fn(() => ({ cse: { list: listMock } })),
    },
}));

import { contextSearch } from '../googleContextSearch.js';

describe('googleContextSearch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.GOOGLE_SEARCH_ENGINE_ID = 'engine-id';
        process.env.GOOGLE_API_KEY = 'secret123';
    });

    it('returns the established failed-search result and masks API keys in logs', async () => {
        listMock.mockRejectedValue(new Error(
            'Request failed: api_key=secret123 Authorization: Bearer secret123'
        ));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await contextSearch('SCIS definition', 'en');

        expect(result).toMatchObject({ provider: 'google', failed: true });
        expect(result.results).toContain('api_key=[REDACTED]');
        expect(result.results).not.toContain('secret123');
        const loggedPayload = consoleSpy.mock.calls[0][1];
        expect(JSON.stringify(loggedPayload)).toContain('[REDACTED]');
        expect(JSON.stringify(loggedPayload)).not.toContain('secret123');
    });

    it('retries a transient failure and returns the normal result shape on success', async () => {
        listMock
            .mockRejectedValueOnce(new Error('Premature close: key=secret123'))
            .mockResolvedValueOnce({
                data: { items: [{ link: 'https://www.canada.ca/a', title: 'A', snippet: 'snippet a' }] },
            });
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await contextSearch('child benefits rural', 'en');

        expect(listMock).toHaveBeenCalledTimes(2);
        expect(result).toEqual({
            provider: 'google',
            results: expect.stringContaining('https://www.canada.ca/a'),
        });
    });

    it('does not retry a permanent failure', async () => {
        listMock.mockRejectedValue(Object.assign(new Error('Request failed'), { code: 400 }));
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await contextSearch('child benefits rural', 'en');

        expect(listMock).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ provider: 'google', failed: true });
    });

    it('returns a failed-search result when configuration is missing', async () => {
        delete process.env.GOOGLE_API_KEY;
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await contextSearch('anything', 'en');

        expect(result).toMatchObject({ provider: 'google', failed: true });
        expect(listMock).not.toHaveBeenCalled();
    });
});
