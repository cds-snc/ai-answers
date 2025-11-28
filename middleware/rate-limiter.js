import { RateLimiterMemory, RateLimiterMongo } from 'rate-limiter-flexible';
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import dbConnect from '../api/db/db-connect.js';
import { SettingsService } from '../services/SettingsService.js';

const _getSetting = (keys) => {
  for (const k of keys) {
    const v = SettingsService.get(k);
    if (typeof v !== 'undefined' && v !== null && v !== '') return v;
  }
  return undefined;
};

export default async function createRateLimiterMiddleware(app) {
  const persistence = (String(_getSetting(['session.persistence', 'SESSION_PERSISTENCE']) || process.env.SESSION_PERSISTENCE || 'memory')).toLowerCase();

  const publicCapacity = Number(_getSetting(['session.rateLimitCapacity', 'SESSION_RATE_LIMIT_CAPACITY']) || process.env.SESSION_RATE_LIMIT_CAPACITY || '60');
  const authCapacity = Number(_getSetting(['session.authenticatedRateLimitCapacity', 'SESSION_AUTH_RATE_LIMIT_CAPACITY']) || process.env.SESSION_AUTH_RATE_LIMIT_CAPACITY || '300');
  // Use 60 second windows (admin UI works in per-minute values)
  const windowSeconds = 60;

  let publicLimiter;
  let authLimiter;
  let mongoClient;

  if (persistence === 'mongo' || persistence === 'mongodb') {
    const mongoUrl = _getSetting(['mongo.uri', 'MONGODB_URI']) || process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/ai-answers';

    // Prefer using the application's existing mongoose connection so we
    // reuse the same MongoClient instance used elsewhere in the app.
    try {
      await dbConnect();
      // Mongoose exposes the native MongoClient via connection.getClient()
      // in newer versions; fall back to connection.client when needed.
      mongoClient = (mongoose.connection && typeof mongoose.connection.getClient === 'function')
        ? mongoose.connection.getClient()
        : (mongoose.connection && mongoose.connection.client) ? mongoose.connection.client : null;
    } catch (err) {
      // If dbConnect failed, we'll fall back to creating a dedicated client.
      mongoClient = null;
      console.warn('Rate limiter: failed to obtain mongoose client, falling back to new MongoClient', err);
    }

    if (!mongoClient) {
      mongoClient = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
      await mongoClient.connect();
    }

    publicLimiter = new RateLimiterMongo({
      storeClient: mongoClient,
      points: Number.isFinite(publicCapacity) && publicCapacity > 0 ? publicCapacity : 60,
      duration: windowSeconds,
      tableName: 'rate_limiter_public'
    });

    authLimiter = new RateLimiterMongo({
      storeClient: mongoClient,
      points: Number.isFinite(authCapacity) && authCapacity > 0 ? authCapacity : 300,
      duration: windowSeconds,
      tableName: 'rate_limiter_auth'
    });
  } else {
    publicLimiter = new RateLimiterMemory({
      points: Number.isFinite(publicCapacity) && publicCapacity > 0 ? publicCapacity : 60,
      duration: windowSeconds
    });

    authLimiter = new RateLimiterMemory({
      points: Number.isFinite(authCapacity) && authCapacity > 0 ? authCapacity : 300,
      duration: windowSeconds
    });
  }

  // Middleware function
  const rateLimitMiddleware = async function rateLimit(req, res, next) {
    const key = (req && req.session && req.sessionID) ? req.sessionID : req.ip;
    const isAuthenticated = !!(req && req.session && req.session.user);
    const limiter = isAuthenticated ? authLimiter : publicLimiter;

    try {
      // consume 1 point per request
      await limiter.consume(key);
      return next();
    } catch (rej) {
      // RateLimiter throws when points exhausted (rej instanceof Error in some cases)
      res.setHeader('Retry-After', String(Math.ceil(rej?.msBeforeNext / 1000) || windowSeconds));
      return res.status(429).send('Too many requests');
    }
  };

  // Expose limiters for SessionManagementService metrics
  rateLimiters.public = publicLimiter;
  rateLimiters.auth = authLimiter;

  return rateLimitMiddleware;
}

export const rateLimiters = { public: null, auth: null };
