/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePassagesProbe, RATE_LIMIT_WAITS_MS } from '../usePassagesProbe.js';

const mocks = vi.hoisted(() => ({ runQuery: vi.fn() }));

vi.mock('../../../services/experimental/PassagesTestClientService.js', () => ({
    PassagesTestClientService: { runQuery: mocks.runQuery },
}));

const rateLimited = { ok: false, reason: 'http_error', status: 429, detail: 'Too many requests', passages: [] };
const ok = { ok: true, status: 200, passages: [] };

describe('usePassagesProbe', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mocks.runQuery.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const runOneOpenCall = async () => {
        const { result } = renderHook(() => usePassagesProbe());
        await act(async () => {
            const running = result.current.run([{ question: 'q', url: '' }], { lang: 'en', maxPassages: 5 });
            await vi.runAllTimersAsync();
            await running;
        });
        return result.current.results;
    };

    it('retries a 429 and records the retry count', async () => {
        mocks.runQuery.mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(ok);
        const [result] = await runOneOpenCall();
        expect(mocks.runQuery).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({ ok: true, retries: 1 });
    });

    it('gives up after the last wait and keeps the 429', async () => {
        mocks.runQuery.mockResolvedValue(rateLimited);
        const [result] = await runOneOpenCall();
        expect(mocks.runQuery).toHaveBeenCalledTimes(RATE_LIMIT_WAITS_MS.length + 1);
        expect(result).toMatchObject({ ok: false, status: 429, retries: RATE_LIMIT_WAITS_MS.length });
    });

    it('does not retry other errors', async () => {
        mocks.runQuery.mockResolvedValue({ ...rateLimited, status: 500 });
        const [result] = await runOneOpenCall();
        expect(mocks.runQuery).toHaveBeenCalledTimes(1);
        expect(result.retries).toBe(0);
    });
});
