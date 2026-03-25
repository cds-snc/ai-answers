import { RateLimiterMemory, RateLimiterMongo } from 'rate-limiter-flexible';
import mongoose from 'mongoose';
import dbConnect from '../api/db/db-connect.js';
import { SettingsService } from '../services/SettingsService.js';

const RESET_PASSWORD_POINTS = 5;
const RESET_PASSWORD_DURATION = 15 * 60; // 15 minutes

const SEND_RESET_POINTS = 3;
const SEND_RESET_DURATION = 15 * 60;

let resetPasswordLimiter = null;
let sendResetLimiter = null;
let initPromise = null;

function _getSetting(keys) {
  for (const k of keys) {
    const v = SettingsService.get(k);
    if (typeof v !== 'undefined' && v !== null && v !== '') return v;
  }
  return undefined;
}

async function buildLimiters() {
  const persistence = (
    String(
      _getSetting(['session.rateLimitPersistence', 'SESSION_RATE_LIMIT_PERSISTENCE'])
      || process.env.SESSION_RATE_LIMIT_PERSISTENCE
      || 'mongo'
    )
  ).toLowerCase();

  if (persistence === 'mongo' || persistence === 'mongodb') {
    let mongoClient;
    try {
      await dbConnect();
      mongoClient = (mongoose.connection && typeof mongoose.connection.getClient === 'function')
        ? mongoose.connection.getClient()
        : (mongoose.connection && mongoose.connection.client) ? mongoose.connection.client : null;
    } catch (_) {
      // Fall through to memory if mongo unavailable
    }

    if (mongoClient) {
      resetPasswordLimiter = new RateLimiterMongo({
        storeClient: mongoClient,
        points: RESET_PASSWORD_POINTS,
        duration: RESET_PASSWORD_DURATION,
        tableName: 'rate_limiter_auth_reset',
      });

      sendResetLimiter = new RateLimiterMongo({
        storeClient: mongoClient,
        points: SEND_RESET_POINTS,
        duration: SEND_RESET_DURATION,
        tableName: 'rate_limiter_auth_send_reset',
      });
      return;
    }
  }

  // Fallback to in-memory
  resetPasswordLimiter = new RateLimiterMemory({
    points: RESET_PASSWORD_POINTS,
    duration: RESET_PASSWORD_DURATION,
    keyPrefix: 'reset-password',
  });

  sendResetLimiter = new RateLimiterMemory({
    points: SEND_RESET_POINTS,
    duration: SEND_RESET_DURATION,
    keyPrefix: 'send-reset',
  });
}

export async function initializeAuthRateLimiter() {
  initPromise = buildLimiters();
  return initPromise;
}

function getKey(req) {
  const email = String(req.body?.email || '').toLowerCase().trim();
  return `${req.ip}_${email}`;
}

async function ensureReady() {
  if (!resetPasswordLimiter || !sendResetLimiter) {
    if (initPromise) await initPromise;
  }
}

export async function resetPasswordRateLimit(req, res, next) {
  try {
    await ensureReady();
    if (!resetPasswordLimiter) return next();
    const key = getKey(req);
    await resetPasswordLimiter.consume(key);
    return next();
  } catch (rej) {
    if (rej && typeof rej.msBeforeNext === 'number') {
      const retryAfter = Math.ceil(rej.msBeforeNext / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        message: 'too many attempts, please try again later',
      });
    }
    // Non-rate-limit error — don't block the request
    return next();
  }
}

export async function sendResetRateLimit(req, res, next) {
  try {
    await ensureReady();
    if (!sendResetLimiter) return next();
    const key = getKey(req);
    await sendResetLimiter.consume(key);
    return next();
  } catch (rej) {
    if (rej && typeof rej.msBeforeNext === 'number') {
      const retryAfter = Math.ceil(rej.msBeforeNext / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        message: 'too many attempts, please try again later',
      });
    }
    return next();
  }
}
