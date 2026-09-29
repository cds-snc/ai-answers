import { createClient } from 'redis';
import { randomUUID } from 'node:crypto';
import dbConnect from '../api/db/db-connect.js';
import { Setting } from '../models/setting.js';
import { SettingsService } from './SettingsService.js';

const ENABLED_KEY = 'downloadWebPage.cache.enabled';
const LOCK_KEY = 'download-web-page-cache:lock';
const GENERATION_KEY = 'download-web-page-cache:generation';
const LOCK_TTL_MS = 60_000;
const LOCK_RENEW_INTERVAL_MS = 20_000;
const LOCK_RETRY_INTERVAL_MS = 100;

let redisClientPromise;
let localGeneration = randomUUID();
let localLockTail = Promise.resolve();
let localLockPending = 0;

async function getRedisClient() {
  if (!process.env.REDIS_URL) {
    if (process.env.S3_BUCKET_NAME) {
      throw new Error('REDIS_URL is required to coordinate the shared web page cache');
    }
    return null;
  }
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const client = createClient({ url: process.env.REDIS_URL });
      client.on('error', (error) => console.error('Web page cache Redis error:', error));
      await client.connect();
      return client;
    })().catch((error) => {
      redisClientPromise = undefined;
      throw error;
    });
  }
  return redisClientPromise;
}

async function withLocalLock(callback, waitForLock) {
  if (!waitForLock && localLockPending > 0) return false;
  const previous = localLockTail;
  let release;
  localLockPending += 1;
  localLockTail = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    return await callback();
  } finally {
    localLockPending -= 1;
    release();
  }
}

async function withRedisLock(client, callback, waitForLock) {
  const token = randomUUID();
  while (await client.set(LOCK_KEY, token, { NX: true, PX: LOCK_TTL_MS }) !== 'OK') {
    if (!waitForLock) return false;
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));
  }

  let lockLost = false;
  const renewTimer = setInterval(async () => {
    try {
      const result = await client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
        { keys: [LOCK_KEY], arguments: [token, String(LOCK_TTL_MS)] }
      );
      if (result !== 1) lockLost = true;
    } catch (_error) {
      lockLost = true;
    }
  }, LOCK_RENEW_INTERVAL_MS);

  try {
    const result = await callback();
    if (lockLost) throw new Error('Web page cache lock was lost during the operation');
    return result;
  } finally {
    clearInterval(renewTimer);
    await client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      { keys: [LOCK_KEY], arguments: [token] }
    );
  }
}

async function runWithDownloadWebPageCacheLock(callback, waitForLock) {
  const client = await getRedisClient();
  return client ? withRedisLock(client, callback, waitForLock) : withLocalLock(callback, waitForLock);
}

export function withDownloadWebPageCacheLock(callback) {
  return runWithDownloadWebPageCacheLock(callback, true);
}

// Cache writes are optional. A clear can hold the lock for the whole S3 delete,
// so skip a write if the lock is busy instead of delaying the fetched page.
export function tryWithDownloadWebPageCacheLock(callback) {
  return runWithDownloadWebPageCacheLock(callback, false);
}

export async function getDownloadWebPageCacheGeneration() {
  const client = await getRedisClient();
  if (!client) return localGeneration;

  let generation = await client.get(GENERATION_KEY);
  if (generation) return generation;
  const initialGeneration = randomUUID();
  await client.set(GENERATION_KEY, initialGeneration, { NX: true });
  generation = await client.get(GENERATION_KEY);
  return generation;
}

export async function advanceDownloadWebPageCacheGeneration() {
  const generation = randomUUID();
  const client = await getRedisClient();
  if (client) await client.set(GENERATION_KEY, generation);
  else localGeneration = generation;
  return generation;
}

export async function isDownloadWebPageCacheEnabled() {
  await dbConnect();
  const setting = await Setting.findOne({ key: ENABLED_KEY });
  return (setting?.value ?? SettingsService.get(ENABLED_KEY)) === 'true';
}

export async function setDownloadWebPageCacheEnabled(enabled) {
  const value = enabled ? 'true' : 'false';
  await dbConnect();
  await Setting.findOneAndUpdate({ key: ENABLED_KEY }, { value }, { upsert: true });
  SettingsService.cache[ENABLED_KEY] = value;
}
