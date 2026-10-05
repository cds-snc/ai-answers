import { createHash } from 'node:crypto';
import storageService, { getStorageObjectWithMetadata } from './Storage.js';
import { SettingsService } from './SettingsService.js';
import {
  advanceSearchResultCacheGeneration,
  getSearchResultCacheGeneration,
  tryWithSearchResultCacheLock,
  withSearchResultCacheLock,
} from './CacheCoordinator.js';

export const SEARCH_CACHE_PREFIX = 'search-context-cache/v1/';
const DEFAULT_CACHE_DURATION_HOURS = 12;

function cacheKey({ provider, query, lang }, generation) {
  const input = JSON.stringify({ provider, query, lang });
  return `${SEARCH_CACHE_PREFIX}${generation}/${createHash('sha256').update(input).digest('hex')}.json`;
}

function isMissingCacheObject(error) {
  return error?.name === 'NoSuchKey' || error?.name === 'NotFound' ||
    error?.code === 'NoSuchKey' || error?.code === 'NotFound' ||
    error?.$metadata?.httpStatusCode === 404 || error?.statusCode === 404;
}

export async function readSearchResultCache(input, generation) {
  let object;
  try {
    object = await getStorageObjectWithMetadata(cacheKey(input, generation));
  } catch (error) {
    if (isMissingCacheObject(error)) return null;
    throw error;
  }
  const fetchedAt = object.lastModified?.getTime();
  const configuredHours = Number(SettingsService.get('searchContext.cache.durationHours'));
  const durationHours = Number.isInteger(configuredHours) && configuredHours >= 1 && configuredHours <= 24
    ? configuredHours
    : DEFAULT_CACHE_DURATION_HOURS;
  if (!fetchedAt || Date.now() - fetchedAt > durationHours * 60 * 60 * 1000) return null;
  return JSON.parse(object.content);
}

export async function writeSearchResultCache(input, result, generation) {
  return tryWithSearchResultCacheLock(async () => {
    if (generation !== await getSearchResultCacheGeneration()) return false;
    await storageService.put(cacheKey(input, generation), JSON.stringify(result), { visibility: 'private' });
    return true;
  });
}

export async function clearSearchResultCache() {
  return withSearchResultCacheLock(async () => {
    await advanceSearchResultCacheGeneration();
    const listing = await storageService.listAll(SEARCH_CACHE_PREFIX, { recursive: true });
    await storageService.deleteAll(SEARCH_CACHE_PREFIX);
    return Array.from(listing.objects || []).length;
  });
}
