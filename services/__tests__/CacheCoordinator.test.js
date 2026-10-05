import { describe, it, expect, vi } from 'vitest';

const { redisClient, createClientMock } = vi.hoisted(() => {
  const redisClient = {
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    set: vi.fn(),
    eval: vi.fn().mockResolvedValue(1),
  };
  return { redisClient, createClientMock: vi.fn(() => redisClient) };
});

vi.mock('redis', () => ({ createClient: createClientMock }));

import {
  withDownloadWebPageCacheLock,
  tryWithDownloadWebPageCacheLock,
} from '../CacheCoordinator.js';

describe('CacheCoordinator lock', () => {
  it('skips an optional local write while a clear holds the lock', async () => {
    vi.stubEnv('REDIS_URL', '');
    vi.stubEnv('S3_BUCKET_NAME', '');
    let finishClear;
    const clear = withDownloadWebPageCacheLock(() => new Promise((resolve) => { finishClear = resolve; }));

    try {
      await vi.waitFor(() => expect(finishClear).toBeTypeOf('function'));
      const write = vi.fn();

      await expect(tryWithDownloadWebPageCacheLock(write)).resolves.toBe(false);
      expect(write).not.toHaveBeenCalled();
    } finally {
      finishClear?.();
      await clear;
      vi.unstubAllEnvs();
    }
  });

  it('skips a cache write after one failed lock attempt while a clear is running', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    redisClient.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    let finishClear;
    const clear = withDownloadWebPageCacheLock(() => new Promise((resolve) => { finishClear = resolve; }));

    try {
      // Wait until the clear has acquired the lock and entered its callback.
      await vi.waitFor(() => expect(finishClear).toBeTypeOf('function'));
      const write = vi.fn();

      await expect(tryWithDownloadWebPageCacheLock(write)).resolves.toBe(false);
      expect(write).not.toHaveBeenCalled();
      expect(redisClient.set).toHaveBeenCalledTimes(2);
    } finally {
      finishClear?.();
      await clear;
      vi.unstubAllEnvs();
    }
  });
});
