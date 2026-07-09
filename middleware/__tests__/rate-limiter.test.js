import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

const { consume, mockGetSetting, mockRedisConnect, mockRedisSet, mockRedisDel } = vi.hoisted(() => ({
  consume: vi.fn().mockResolvedValue({
    remainingPoints: 59,
    consumedPoints: 1,
    msBeforeNext: 1000
  }),
  mockRedisConnect: vi.fn().mockResolvedValue(undefined),
  mockRedisSet: vi.fn().mockResolvedValue('OK'),
  mockRedisDel: vi.fn().mockResolvedValue(1),
  mockGetSetting: vi.fn((key) => {
    const settingKey = Array.isArray(key) ? key[0] : key;
    if (settingKey === 'session.rateLimitPersistence') return 'memory';
    if (settingKey === 'session.rateLimitCapacity') return '60';
    if (settingKey === 'session.rateLimitRefillPerSec') return '60';
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
    set: mockRedisSet,
    del: mockRedisDel,
  })),
}));

vi.mock('../../services/SettingsService.js', () => ({
  SettingsService: {
    get: mockGetSetting,
  },
}));

import { initializeRateLimiter, rateLimiterMiddleware } from '../rate-limiter.js';

function createResponse() {
  const res = new EventEmitter();
  res.setHeader = vi.fn();
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn();
  res.json = vi.fn();
  return res;
}

describe('rate limiter key selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSetting.mockImplementation((key) => {
      const settingKey = Array.isArray(key) ? key[0] : key;
      if (settingKey === 'session.rateLimitPersistence') return 'memory';
      if (settingKey === 'session.rateLimitCapacity') return '60';
      if (settingKey === 'session.rateLimitRefillPerSec') return '60';
      if (settingKey === 'session.singleAnonymousChatRunEnabled') return 'true';
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
    const res = createResponse();
    const next = vi.fn();

    await rateLimiterMiddleware(req, res, next);

    expect(consume).toHaveBeenCalledWith('visitor:visitor-hash-abc');
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.rateLimiterSnapshot).toMatchObject({ authenticated: false, keyType: 'visitor' });
  });

  it('bypasses rate limiting for authenticated requests', async () => {
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
    const res = createResponse();
    const next = vi.fn();

    await rateLimiterMiddleware(req, res, next);

    expect(consume).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.rateLimiterSnapshot).toBeUndefined();
  });

  it('can initialize Redis-backed limiters', async () => {
    mockGetSetting.mockImplementation((key) => {
      const settingKey = Array.isArray(key) ? key[0] : key;
      if (settingKey === 'session.rateLimitPersistence') return 'redis';
      if (settingKey === 'session.rateLimitCapacity') return '60';
      if (settingKey === 'session.rateLimitRefillPerSec') return '60';
      if (settingKey === 'session.singleAnonymousChatRunEnabled') return 'true';
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
    const res = createResponse();
    const next = vi.fn();

    await rateLimiterMiddleware(req, res, next);

    expect(mockRedisConnect).toHaveBeenCalled();
    expect(consume).toHaveBeenCalledWith('visitor:visitor-hash-redis');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects a second anonymous chat graph run until the first response finishes', async () => {
    await initializeRateLimiter();

    const makeReq = () => ({
      method: 'POST',
      originalUrl: '/api/chat/chat-graph-run',
      ip: '203.0.113.13',
      sessionID: 'session-abc',
      session: {
        visitorId: 'visitor-hash-lock'
      }
    });

    const firstRes = createResponse();
    const firstNext = vi.fn();
    await rateLimiterMiddleware(makeReq(), firstRes, firstNext);
    expect(firstNext).toHaveBeenCalledTimes(1);

    const secondRes = createResponse();
    const secondNext = vi.fn();
    await rateLimiterMiddleware(makeReq(), secondRes, secondNext);
    expect(secondRes.status).toHaveBeenCalledWith(429);
    expect(secondRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'chat_run_in_progress' }));
    expect(secondNext).not.toHaveBeenCalled();

    firstRes.emit('finish');

    const thirdRes = createResponse();
    const thirdNext = vi.fn();
    await rateLimiterMiddleware(makeReq(), thirdRes, thirdNext);
    expect(thirdNext).toHaveBeenCalledTimes(1);
    thirdRes.emit('finish');
  });

  it('uses Redis for the anonymous single-run guard when Redis persistence is selected', async () => {
    mockGetSetting.mockImplementation((key) => {
      const settingKey = Array.isArray(key) ? key[0] : key;
      if (settingKey === 'session.rateLimitPersistence') return 'redis';
      if (settingKey === 'session.rateLimitCapacity') return '60';
      if (settingKey === 'session.rateLimitRefillPerSec') return '60';
      if (settingKey === 'session.singleAnonymousChatRunEnabled') return 'true';
      return undefined;
    });
    mockRedisSet
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(null);

    await initializeRateLimiter();

    const makeReq = () => ({
      method: 'POST',
      originalUrl: '/api/chat/chat-graph-run',
      ip: '203.0.113.15',
      sessionID: 'session-redis-lock',
      session: {
        visitorId: 'visitor-hash-redis-lock'
      }
    });

    const firstRes = createResponse();
    const firstNext = vi.fn();
    await rateLimiterMiddleware(makeReq(), firstRes, firstNext);
    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(mockRedisSet).toHaveBeenCalledWith(
      'aianswers:chat-run:visitor:visitor-hash-redis-lock',
      '1',
      { NX: true, EX: 300 }
    );

    const secondRes = createResponse();
    const secondNext = vi.fn();
    await rateLimiterMiddleware(makeReq(), secondRes, secondNext);
    expect(secondRes.status).toHaveBeenCalledWith(429);
    expect(secondNext).not.toHaveBeenCalled();

    firstRes.emit('finish');
    expect(mockRedisDel).toHaveBeenCalledWith('aianswers:chat-run:visitor:visitor-hash-redis-lock');
  });

  it('does not apply the anonymous single-run guard when disabled', async () => {
    mockGetSetting.mockImplementation((key) => {
      const settingKey = Array.isArray(key) ? key[0] : key;
      if (settingKey === 'session.rateLimitPersistence') return 'memory';
      if (settingKey === 'session.rateLimitCapacity') return '60';
      if (settingKey === 'session.rateLimitRefillPerSec') return '60';
      if (settingKey === 'session.singleAnonymousChatRunEnabled') return 'false';
      return undefined;
    });
    await initializeRateLimiter();

    const req = {
      method: 'POST',
      originalUrl: '/api/chat/chat-graph-run',
      ip: '203.0.113.14',
      sessionID: 'session-disabled',
      session: {
        visitorId: 'visitor-hash-disabled'
      }
    };

    const firstNext = vi.fn();
    await rateLimiterMiddleware(req, createResponse(), firstNext);
    const secondNext = vi.fn();
    await rateLimiterMiddleware(req, createResponse(), secondNext);

    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(secondNext).toHaveBeenCalledTimes(1);
  });
});
