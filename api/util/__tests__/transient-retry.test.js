import { describe, it, expect, vi } from 'vitest';
import {
    isTransientNetworkError,
    retryOnTransientError,
} from '../transient-retry.js';

const withCode = (code, message = 'boom') => Object.assign(new Error(message), { code });

describe('isTransientNetworkError', () => {
    it('treats socket-level failures as transient', () => {
        for (const code of ['ECONNRESET', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN']) {
            expect(isTransientNetworkError(withCode(code))).toBe(true);
        }
    });

    it('treats an axios timeout (ECONNABORTED) as transient', () => {
        // axios reports its own `timeout:` overrun as ECONNABORTED, not ETIMEDOUT.
        const timeout = withCode('ECONNABORTED', 'timeout of 5000ms exceeded');
        expect(isTransientNetworkError(timeout)).toBe(true);
    });

    it('treats 5xx as transient but 4xx as final', () => {
        expect(isTransientNetworkError({ response: { status: 503 } })).toBe(true);
        expect(isTransientNetworkError({ status: 502 })).toBe(true);
        expect(isTransientNetworkError({ response: { status: 404 } })).toBe(false);
        expect(isTransientNetworkError({ response: { status: 403 } })).toBe(false);
        expect(isTransientNetworkError({ code: 400 })).toBe(false);
    });

    it('matches codeless transport failures by message', () => {
        expect(isTransientNetworkError(new Error('socket hang up'))).toBe(true);
        expect(isTransientNetworkError(new Error('Premature close'))).toBe(true);
    });

    it('does not retry ordinary application errors', () => {
        expect(isTransientNetworkError(new Error('No readable content at url'))).toBe(false);
        expect(isTransientNetworkError(null)).toBe(false);
    });
});

describe('retryOnTransientError', () => {
    it('returns the first successful result without retrying', async () => {
        const fn = vi.fn().mockResolvedValue('ok');
        await expect(retryOnTransientError(fn)).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries a transient failure and returns the eventual success', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(withCode('ECONNRESET', 'read ECONNRESET'))
            .mockResolvedValueOnce('ok');

        await expect(retryOnTransientError(fn, { baseDelayMs: 0 })).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('gives up after the attempt budget and rethrows the last error', async () => {
        const fn = vi.fn().mockRejectedValue(withCode('ECONNRESET', 'read ECONNRESET'));

        await expect(retryOnTransientError(fn, { attempts: 3, baseDelayMs: 0 }))
            .rejects.toThrow(/ECONNRESET/);
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('does not retry a non-transient failure', async () => {
        const fn = vi.fn().mockRejectedValue({ response: { status: 404 } });

        await expect(retryOnTransientError(fn, { baseDelayMs: 0 })).rejects.toEqual({
            response: { status: 404 },
        });
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('rethrows the original error object untouched', async () => {
        const original = withCode('ECONNRESET', 'read ECONNRESET');
        const fn = vi.fn().mockRejectedValue(original);

        const thrown = await retryOnTransientError(fn, { attempts: 2, baseDelayMs: 0 })
            .catch((e) => e);

        expect(thrown).toBe(original);
    });

    it('reports each retry through onRetry', async () => {
        const onRetry = vi.fn();
        const fn = vi.fn()
            .mockRejectedValueOnce(withCode('ECONNRESET'))
            .mockResolvedValueOnce('ok');

        await retryOnTransientError(fn, { baseDelayMs: 0, onRetry });

        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry.mock.calls[0][0]).toMatchObject({ attempt: 1, attempts: 3 });
    });

    it('honours a caller-supplied isRetryable predicate', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('nope'));

        await expect(
            retryOnTransientError(fn, { baseDelayMs: 0, isRetryable: () => true, attempts: 2 })
        ).rejects.toThrow('nope');
        expect(fn).toHaveBeenCalledTimes(2);
    });
});

describe('retryOnTransientError time budget', () => {
    it('stops retrying once maxElapsedMs is spent', async () => {
        const slowFailure = vi.fn(async () => {
            await new Promise((r) => setTimeout(r, 60));
            throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
        });

        await expect(
            retryOnTransientError(slowFailure, { attempts: 5, baseDelayMs: 0, maxElapsedMs: 100 })
        ).rejects.toThrow('timeout');

        // Two attempts fit inside the 100ms budget; the third is not started.
        expect(slowFailure).toHaveBeenCalledTimes(2);
    });

    it('leaves fast failures free to use the full attempt budget', async () => {
        const fastFailure = vi.fn().mockRejectedValue(
            Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
        );

        await expect(
            retryOnTransientError(fastFailure, { attempts: 3, baseDelayMs: 0, maxElapsedMs: 5000 })
        ).rejects.toThrow(/ECONNRESET/);
        expect(fastFailure).toHaveBeenCalledTimes(3);
    });
});

describe('isTransientNetworkError status resolution', () => {
    it('reads a 5xx from .response even when .code holds a string', () => {
        // axios shape for a 503: a string `code` must not mask the real status.
        expect(isTransientNetworkError({
            code: 'ERR_BAD_RESPONSE',
            response: { status: 503 },
        })).toBe(true);
    });

    it('still retries a transport failure that carries a non-5xx status', () => {
        // Headers arrived 200, then the body stream died mid-read.
        expect(isTransientNetworkError({
            response: { status: 200 },
            message: 'Premature close',
        })).toBe(true);
    });

    it('does not let a sub-500 status turn an ordinary 4xx into a retry', () => {
        expect(isTransientNetworkError({
            code: 'ERR_BAD_REQUEST',
            response: { status: 404 },
            message: 'Request failed with status code 404',
        })).toBe(false);
    });
});
