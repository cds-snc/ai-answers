import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import storageService from '../Storage.js';
import {
  SEARCH_CACHE_PREFIX,
  clearSearchResultCache,
  readSearchResultCache,
  writeSearchResultCache,
} from '../SearchResultCacheService.js';

const settingsGetMock = vi.hoisted(() => vi.fn());

vi.mock('../Storage.js', () => ({
  default: {
    get: vi.fn(),
    getMetaData: vi.fn(),
    put: vi.fn(),
    listAll: vi.fn(),
    deleteAll: vi.fn(),
  },
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a fresh cached search result', async () => {
    const result = { results: 'Title: A' };
    storageService.get.mockResolvedValue(JSON.stringify(result));
    storageService.getMetaData.mockResolvedValue({
      lastModified: new Date(Date.now() - (12 * 60 * 60 * 1000) + 1),
    });

    await expect(readSearchResultCache({ provider: 'google', query: 'benefits', lang: 'en' }))
      .resolves.toEqual(result);
  });

  it('treats expired or undated objects as cache misses', async () => {
    storageService.get.mockResolvedValue('{"results":"stale"}');
    storageService.getMetaData.mockResolvedValue({
      lastModified: new Date(Date.now() - (12 * 60 * 60 * 1000) - 1),
    });
    await expect(readSearchResultCache({ provider: 'google', query: 'benefits', lang: 'en' }))
      .resolves.toBeNull();

    storageService.getMetaData.mockResolvedValue({});
    await expect(readSearchResultCache({ provider: 'google', query: 'other', lang: 'en' }))
      .resolves.toBeNull();
  });

  it('uses the configured cache duration', async () => {
    settingsGetMock.mockReturnValue('1');
    storageService.get.mockResolvedValue('{"results":"fresh"}');
    storageService.getMetaData.mockResolvedValue({
      lastModified: new Date(Date.now() - (60 * 60 * 1000) - 1),
    });

    await expect(readSearchResultCache({ provider: 'google', query: 'benefits', lang: 'en' }))
      .resolves.toBeNull();
  });

  it('stores private results under keys scoped by provider, query and language', async () => {
    await writeSearchResultCache(
      { provider: 'google', query: 'benefits', lang: 'en' },
      { results: 'Title: A' },
    );
    await writeSearchResultCache(
      { provider: 'canadaca', query: 'benefits', lang: 'en' },
      { results: 'Summary: B' },
    );

    const firstKey = storageService.put.mock.calls[0][0];
    const secondKey = storageService.put.mock.calls[1][0];
    expect(firstKey).toMatch(new RegExp(`^${SEARCH_CACHE_PREFIX}.*\\.json$`));
    expect(secondKey).not.toBe(firstKey);
    expect(storageService.put).toHaveBeenNthCalledWith(1, firstKey, '{"results":"Title: A"}', { visibility: 'private' });
  });

  it('clears only search-result cache objects and returns the deleted count', async () => {
    storageService.listAll.mockResolvedValue({ objects: [{ key: 'one' }, { key: 'two' }] });

    await expect(clearSearchResultCache()).resolves.toBe(2);
    expect(storageService.listAll).toHaveBeenCalledWith(SEARCH_CACHE_PREFIX, { recursive: true });
    expect(storageService.deleteAll).toHaveBeenCalledWith(SEARCH_CACHE_PREFIX);
  });
});
