import { createHash } from 'node:crypto';
import storageService from './Storage.js';
import { SettingsService } from './SettingsService.js';

export const SEARCH_CACHE_PREFIX = 'search-context-cache/v1/';
const DEFAULT_CACHE_DURATION_HOURS = 12;

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
  const configuredHours = Number(SettingsService.get('searchContext.cache.durationHours'));
  const durationHours = Number.isInteger(configuredHours) && configuredHours >= 1 && configuredHours <= 24
    ? configuredHours
    : DEFAULT_CACHE_DURATION_HOURS;
  if (!fetchedAt || Date.now() - fetchedAt > durationHours * 60 * 60 * 1000) return null;
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
