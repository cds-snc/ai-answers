import { afterEach, describe, expect, it, vi } from 'vitest';
import { contextSearch } from '../coveoPassageRetrieval.js';

describe('Coveo Passage Retrieval', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('sends the documented payload and formats returned passages as context', async () => {
        vi.stubEnv('COVEO_ORGANIZATION_ID', 'test-org');
        vi.stubEnv('COVEO_PASSAGE_RETRIEVAL_API_KEY', 'test-token');
        vi.stubEnv('COVEO_PASSAGE_RETRIEVAL_SEARCH_HUB', 'test-search-hub');
        const fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                items: [{
                    text: 'A relevant passage.',
                    document: {
                        title: 'A source page',
                        clickableuri: 'https://example.com/source',
                    },
                }],
                responseId: 'response-id',
            }),
        });
        vi.stubGlobal('fetch', fetch);

        const result = await contextSearch('A question', 'fr');

        expect(fetch).toHaveBeenCalledWith(
            'https://test-org.org.coveo.com/rest/search/v3/passages/retrieve',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-token',
                    'Content-Type': 'application/json',
                }),
                body: JSON.stringify({
                    query: 'A question',
                    searchHub: 'test-search-hub',
                    localization: { locale: 'fr-CA' },
                    maxPassages: 5,
                    additionalFields: ['clickableuri'],
                }),
            })
        );
        expect(result).toEqual({
            results: 'Passage: A relevant passage.\nLink Text: A source page\nLink: https://example.com/source',
            provider: 'coveo-passage-retrieval',
            responseId: 'response-id',
        });
    });

    it('fails with the missing server configuration names', async () => {
        vi.stubEnv('COVEO_ORGANIZATION_ID', '');
        vi.stubEnv('COVEO_PASSAGE_RETRIEVAL_API_KEY', '');

        await expect(contextSearch('A question')).rejects.toThrow(
            'COVEO_ORGANIZATION_ID and COVEO_PASSAGE_RETRIEVAL_API_KEY are required'
        );
    });

    it('surfaces unsuccessful Coveo responses without exposing response bodies', async () => {
        vi.stubEnv('COVEO_ORGANIZATION_ID', 'test-org');
        vi.stubEnv('COVEO_PASSAGE_RETRIEVAL_API_KEY', 'test-token');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

        await expect(contextSearch('A question')).rejects.toThrow(
            'Coveo Passage Retrieval API request failed with status 403.'
        );
    });
});
