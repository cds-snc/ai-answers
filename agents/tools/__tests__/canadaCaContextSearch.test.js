import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { contextSearch } from '../canadaCaContextSearch.js';

// Retry lives inside this tool now (SearchContextService no longer wraps it in
// exponentialBackoff), so these tests are what keep a transient Coveo failure
// from silently becoming a hard search failure.
describe('canadaCaContextSearch retry', () => {
    let fetchMock;

    const okResponse = () => ({
        ok: true,
        status: 200,
        json: async () => ({ results: [{ clickUri: 'https://x', title: 'T', excerpt: 'E' }] }),
    });

    const errorResponse = (status) => ({
        ok: false,
        status,
        statusText: 'Err',
        text: async () => 'body',
    });

    // The shape native fetch actually throws: undici reports every transport
    // failure as a bare `TypeError: fetch failed` with no `.code` of its own, and
    // nests the real socket error in `.cause`. An earlier version of these tests
    // rejected with a hand-rolled `Error` carrying a top-level `code` — a shape
    // fetch never produces — so they passed while the retry path was dead.
    const undiciFailure = (code) =>
        Object.assign(new TypeError('fetch failed'), {
            cause: Object.assign(new Error(`connect ${code} 127.0.0.1:443`), { code }),
        });

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        process.env.CANADA_CA_SEARCH_URI = 'https://search.test';
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // Drives a call that has to sleep between attempts to completion.
    async function runWithRetries(promise) {
        const settled = promise.then(
            (value) => ({ value }),
            (error) => ({ error })
        );
        await vi.advanceTimersByTimeAsync(5000);
        return settled;
    }

    it('retries a dropped socket and succeeds on the second attempt', async () => {
        const reset = undiciFailure('ECONNRESET');
        fetchMock.mockRejectedValueOnce(reset).mockResolvedValueOnce(okResponse());

        const { value, error } = await runWithRetries(contextSearch('q', 'en'));

        expect(error).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(value.provider).toBe('canadaca');
        expect(value.results).toContain('Summary: E');
    });

    // Guards the `error.status = response.status` line: fetch reports the status
    // on the response, so without it a 503 arrives as a bare Error and is
    // misread as permanent.
    it('retries a 5xx', async () => {
        fetchMock.mockResolvedValueOnce(errorResponse(503)).mockResolvedValueOnce(okResponse());

        const { value, error } = await runWithRetries(contextSearch('q', 'en'));

        expect(error).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(value.results).toContain('Summary: E');
    });

    it('does not retry a 4xx — it fails on the first attempt', async () => {
        fetchMock.mockResolvedValue(errorResponse(404));

        await expect(contextSearch('q', 'en')).rejects.toThrow('HTTP error! Status: 404');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('gives up after 3 attempts and rethrows the last error', async () => {
        const reset = undiciFailure('ECONNRESET');
        fetchMock.mockRejectedValue(reset);

        const { error } = await runWithRetries(contextSearch('q', 'en'));

        expect(error).toBe(reset);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('reports each retry to the caller-supplied onRetry', async () => {
        const reset = undiciFailure('ECONNRESET');
        fetchMock.mockRejectedValueOnce(reset).mockResolvedValueOnce(okResponse());
        const onRetry = vi.fn();

        await runWithRetries(contextSearch('q', 'en', { onRetry }));

        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, error: reset }));
    });

    // Pins the classification rather than the retry count, so this fails loudly
    // if isTransientNetworkError ever stops reading the cause chain: a
    // top-level-only check sees a codeless TypeError and gives up after one try.
    it('reads the nested cause when deciding to retry', async () => {
        fetchMock.mockRejectedValue(undiciFailure('EAI_AGAIN'));

        const { error } = await runWithRetries(contextSearch('q', 'en'));

        expect(error).toBeDefined();
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});
