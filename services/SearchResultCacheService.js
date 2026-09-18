import { createHash } from 'node:crypto';
import storageService from './Storage.js';

export const SEARCH_CACHE_PREFIX = 'search-context-cache/v1/';
export const SEARCH_CACHE_FRESHNESS_MS = 12 * 60 * 60 * 1000;

function cacheKey({ provider, query, lang }) {
  const input = JSON.stringify({ provider, query, lang });
  return `${SEARCH_CACHE_PREFIX}${createHash('sha256').update(input).digest('hex')}.json`;
}

export async function readSearchResultCache(input) {
  const key = cacheKey(input);
  const [serialized, metadata] = await Promise.all([
    storageService.get(key),
    storageService.getMetaData(key),
  ]);
  const fetchedAt = metadata.lastModified?.getTime();
  if (!fetchedAt || Date.now() - fetchedAt > SEARCH_CACHE_FRESHNESS_MS) return null;
  return JSON.parse(serialized);
}

export async function writeSearchResultCache(input, result) {
  await storageService.put(cacheKey(input), JSON.stringify(result), { visibility: 'private' });
}

export async function clearSearchResultCache() {
  const listing = await storageService.listAll(SEARCH_CACHE_PREFIX, { recursive: true });
  const objects = Array.from(listing.objects || []);
  await storageService.deleteAll(SEARCH_CACHE_PREFIX);
  return objects.length;
}
