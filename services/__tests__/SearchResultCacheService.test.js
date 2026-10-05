import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import storageService, { getStorageObjectWithMetadata } from '../Storage.js';
import {
  SEARCH_CACHE_PREFIX,
  clearSearchResultCache,
  readSearchResultCache,
  writeSearchResultCache,
} from '../SearchResultCacheService.js';

const settingsGetMock = vi.hoisted(() => vi.fn());
const cacheGenerationMock = vi.hoisted(() => vi.fn());
const advanceCacheGenerationMock = vi.hoisted(() => vi.fn());

vi.mock('../Storage.js', () => ({
  default: {
    put: vi.fn(),
    listAll: vi.fn(),
    deleteAll: vi.fn(),
  },
  getStorageObjectWithMetadata: vi.fn(),
}));

vi.mock('../CacheCoordinator.js', () => ({
  getSearchResultCacheGeneration: cacheGenerationMock,
  advanceSearchResultCacheGeneration: advanceCacheGenerationMock,
  tryWithSearchResultCacheLock: (callback) => callback(),
  withSearchResultCacheLock: (callback) => callback(),
}));

vi.mock('../SettingsService.js', () => ({
  SettingsService: { get: settingsGetMock },
}));

describe('SearchResultCacheService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    settingsGetMock.mockReturnValue('12');
    cacheGenerationMock.mockResolvedValue('generation-1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a fresh cached search result', async () => {
    const result = { results: 'Title: A' };
    getStorageObjectWithMetadata.mockResolvedValue({ content: JSON.stringify(result),
      lastModified: new Date(Date.now() - (12 * 60 * 60 * 1000) + 1),
    });

    await expect(readSearchResultCache({ provider: 'google', query: 'benefits', lang: 'en' }))
      .resolves.toEqual(result);
  });

  it('treats expired or undated objects as cache misses', async () => {
    getStorageObjectWithMetadata.mockResolvedValue({ content: '{"results":"stale"}',
      lastModified: new Date(Date.now() - (12 * 60 * 60 * 1000) - 1),
    });
    await expect(readSearchResultCache({ provider: 'google', query: 'benefits', lang: 'en' }))
      .resolves.toBeNull();

    getStorageObjectWithMetadata.mockResolvedValue({ content: '{"results":"stale"}' });
    await expect(readSearchResultCache({ provider: 'google', query: 'other', lang: 'en' }))
      .resolves.toBeNull();
  });

  it('uses the configured cache duration', async () => {
    settingsGetMock.mockReturnValue('1');
    getStorageObjectWithMetadata.mockResolvedValue({ content: '{"results":"fresh"}',
      lastModified: new Date(Date.now() - (60 * 60 * 1000) - 1),
    });

    await expect(readSearchResultCache({ provider: 'google', query: 'benefits', lang: 'en' }))
      .resolves.toBeNull();
  });

  it('stores private results under keys scoped by provider, query and language', async () => {
    await writeSearchResultCache(
      { provider: 'google', query: 'benefits', lang: 'en' },
      { results: 'Title: A' },
      'generation-1',
    );
    await writeSearchResultCache(
      { provider: 'canadaca', query: 'benefits', lang: 'en' },
      { results: 'Summary: B' },
      'generation-1',
    );

    const firstKey = storageService.put.mock.calls[0][0];
    const secondKey = storageService.put.mock.calls[1][0];
    expect(firstKey).toMatch(new RegExp(`^${SEARCH_CACHE_PREFIX}.*\\.json$`));
    expect(secondKey).not.toBe(firstKey);
    expect(storageService.put).toHaveBeenNthCalledWith(1, firstKey, '{"results":"Title: A"}', { visibility: 'private' });
  });

  it('clears only search-result cache objects without listing or counting them', async () => {
    await expect(clearSearchResultCache()).resolves.toBeUndefined();
    expect(storageService.listAll).not.toHaveBeenCalled();
    expect(storageService.deleteAll).toHaveBeenCalledWith(SEARCH_CACHE_PREFIX);
    expect(advanceCacheGenerationMock).toHaveBeenCalledOnce();
  });

  it('rejects when cache deletion fails', async () => {
    storageService.deleteAll.mockRejectedValueOnce(new Error('Storage unavailable'));

    await expect(clearSearchResultCache()).rejects.toThrow('Storage unavailable');
  });

  it('treats a missing storage object as a cache miss', async () => {
    getStorageObjectWithMetadata.mockRejectedValue({ name: 'NoSuchKey' });
    await expect(readSearchResultCache({ provider: 'google', query: 'benefits', lang: 'en' }, 'generation-1'))
      .resolves.toBeNull();
  });
});
