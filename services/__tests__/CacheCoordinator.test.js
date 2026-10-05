import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';

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
vi.mock('../../api/db/db-connect.js', () => ({ default: vi.fn() }));
vi.mock('../../models/setting.js', () => ({ Setting: {} }));
vi.mock('../SettingsService.js', () => ({ SettingsService: { get: vi.fn(), cache: {} } }));

import {
  withDownloadWebPageCacheLock,
  tryWithDownloadWebPageCacheLock,
} from '../CacheCoordinator.js';

describe('CacheCoordinator lock', () => {
  it.each(['handshake', 'command'])('rejects a stalled Redis %s so callers can fall back', async (stage) => {
    vi.resetModules();
    const { createClient } = createRequire(import.meta.url)('redis');
    let client;
    createClientMock.mockImplementationOnce((options) => {
      client = createClient(options);
      return client;
    });
    const sockets = new Set();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('data', (data) => {
        // Complete CLIENT SETINFO, then leave GET unanswered in the command case.
        if (stage === 'command' && data.toString().includes('CLIENT')) {
          socket.write('+OK\r\n'.repeat((data.toString().match(/^\*\d+/gm) || []).length));
        }
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    vi.stubEnv('REDIS_URL', `redis://127.0.0.1:${server.address().port}`);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let timer;
    try {
      const { getSearchResultCacheGeneration } = await import('../CacheCoordinator.js');
      await expect(Promise.race([
        getSearchResultCacheGeneration(),
        new Promise((resolve) => { timer = setTimeout(() => resolve('still waiting'), 2000); }),
      ])).rejects.toBeInstanceOf(Error);
      // A failed client must not leave caching permanently unavailable.
      createClientMock.mockReturnValueOnce({
        on: vi.fn(),
        connect: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue('recovered-generation'),
      });
      await expect(getSearchResultCacheGeneration()).resolves.toBe('recovered-generation');
    } finally {
      clearTimeout(timer);
      if (client?.isOpen) client.destroy();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });

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
