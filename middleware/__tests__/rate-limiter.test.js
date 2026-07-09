import { beforeEach, describe, expect, it, vi } from 'vitest';

const { consume, mockGetSetting, mockRedisConnect } = vi.hoisted(() => ({
  consume: vi.fn().mockResolvedValue({
    remainingPoints: 59,
    consumedPoints: 1,
    msBeforeNext: 1000
  }),
  mockRedisConnect: vi.fn().mockResolvedValue(undefined),
  mockGetSetting: vi.fn((key) => {
    const settingKey = Array.isArray(key) ? key[0] : key;
    if (settingKey === 'session.rateLimitPersistence') return 'memory';
    if (settingKey === 'session.rateLimitCapacity') return '60';
    if (settingKey === 'session.authenticatedRateLimitCapacity') return '300';
    if (settingKey === 'session.rateLimitRefillPerSec') return '60';
    if (settingKey === 'session.authenticatedRateLimitRefillPerSec') return '300';
    return undefined;
  }),
}));

vi.mock('rate-limiter-flexible', () => ({
  RateLimiterMemory: class MockRateLimiterMemory {
    constructor(options) {
      this.points = options.points;
      this.duration = options.duration;
      this.consume = consume;
    }
  },
  RateLimiterMongo: class MockRateLimiterMongo {
    constructor(options) {
      this.points = options.points;
      this.duration = options.duration;
      this.consume = consume;
    }
  },
  RateLimiterRedis: class MockRateLimiterRedis {
    constructor(options) {
      this.points = options.points;
      this.duration = options.duration;
      this.consume = consume;
    }
  },
}));

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: mockRedisConnect,
    on: vi.fn(),
  })),
}));

vi.mock('mongoose', () => ({
  default: {
    connection: {}
  }
}));

vi.mock('../../api/db/db-connect.js', () => ({
  default: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../services/SettingsService.js', () => ({
  SettingsService: {
    get: mockGetSetting,
  },
}));

import { initializeRateLimiter, rateLimiterMiddleware } from '../rate-limiter.js';

describe('rate limiter key selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSetting.mockImplementation((key) => {
      const settingKey = Array.isArray(key) ? key[0] : key;
      if (settingKey === 'session.rateLimitPersistence') return 'memory';
      if (settingKey === 'session.rateLimitCapacity') return '60';
      if (settingKey === 'session.authenticatedRateLimitCapacity') return '300';
      if (settingKey === 'session.rateLimitRefillPerSec') return '60';
      if (settingKey === 'session.authenticatedRateLimitRefillPerSec') return '300';
      return undefined;
    });
  });

  it('uses the hashed visitor fingerprint for anonymous requests when available', async () => {
    await initializeRateLimiter();

    const req = {
      ip: '203.0.113.10',
      sessionID: 'session-123',
      session: {
        visitorId: 'visitor-hash-abc'
      }
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    const next = vi.fn();

    await rateLimiterMiddleware(req, res, next);

    expect(consume).toHaveBeenCalledWith('visitor:visitor-hash-abc');
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.rateLimiterSnapshot).toMatchObject({ authenticated: false, keyType: 'visitor' });
  });

  it('keeps authenticated requests keyed by session id', async () => {
    await initializeRateLimiter();

    const req = {
      ip: '203.0.113.11',
      sessionID: 'session-456',
      user: { userId: 'user-1', role: 'admin' },
      session: {
        passport: { user: { userId: 'user-1' } },
        visitorId: 'visitor-hash-def'
      }
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    const next = vi.fn();

    await rateLimiterMiddleware(req, res, next);

    expect(consume).toHaveBeenCalledWith('auth:session-456');
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.rateLimiterSnapshot).toMatchObject({ authenticated: true, keyType: 'auth' });
  });

  it('can initialize Redis-backed limiters', async () => {
    mockGetSetting.mockImplementation((key) => {
      const settingKey = Array.isArray(key) ? key[0] : key;
      if (settingKey === 'session.rateLimitPersistence') return 'redis';
      if (settingKey === 'session.rateLimitCapacity') return '60';
      if (settingKey === 'session.authenticatedRateLimitCapacity') return '300';
      if (settingKey === 'session.rateLimitRefillPerSec') return '60';
      if (settingKey === 'session.authenticatedRateLimitRefillPerSec') return '300';
      return undefined;
    });

    await initializeRateLimiter();

    const req = {
      ip: '203.0.113.12',
      sessionID: 'session-789',
      session: {
        visitorId: 'visitor-hash-redis'
      }
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    const next = vi.fn();

    await rateLimiterMiddleware(req, res, next);

    expect(mockRedisConnect).toHaveBeenCalled();
    expect(consume).toHaveBeenCalledWith('visitor:visitor-hash-redis');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
