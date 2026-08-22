import { describe, it, expect, vi } from 'vitest';
import { exponentialBackoff } from '../backoff.js';

describe('exponentialBackoff', () => {
  it('returns the result on first success without calling onRetry', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const onRetry = vi.fn();

    const result = await exponentialBackoff(fn, 3, 1, onRetry);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('calls onRetry once per retry attempt, not on the final throw', async () => {
    const err = new Error('boom');
    const fn = vi.fn().mockRejectedValue(err);
    const onRetry = vi.fn();

    await expect(exponentialBackoff(fn, 2, 1, onRetry)).rejects.toThrow('boom');

    // retries=2 means 3 total attempts (initial + 2 retries), so onRetry fires twice
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(err, 2);
    expect(onRetry).toHaveBeenCalledWith(err, 1);
  });

  it('recovers after a retry and never calls onRetry again once it succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce('recovered');
    const onRetry = vi.fn();

    const result = await exponentialBackoff(fn, 3, 1, onRetry);

    expect(result).toBe('recovered');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('never throws even if onRetry itself throws', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce('recovered');
    const onRetry = vi.fn(() => { throw new Error('callback exploded'); });

    await expect(exponentialBackoff(fn, 3, 1, onRetry)).resolves.toBe('recovered');
  });

  it('works with no onRetry provided (backward compatible)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');

    await expect(exponentialBackoff(fn, 3, 1)).resolves.toBe('ok');
  });
});
