import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

const { consume, consumed, mockGetSetting, mockRedisConnect, mockRedisSet, mockRedisEval } = vi.hoisted(() => ({
  consume: vi.fn().mockResolvedValue({
    remainingPoints: 59,
    consumedPoints: 1,
    msBeforeNext: 1000
  }),
  consumed: [],
  mockRedisConnect: vi.fn().mockResolvedValue(undefined),
  mockRedisSet: vi.fn().mockResolvedValue('OK'),
  mockRedisEval: vi.fn().mockResolvedValue(1),
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
      this.consume = (key) => {
        consumed.push({ key, points: this.points });
        return consume(key);
      };
    }
  },
  RateLimiterRedis: class MockRateLimiterRedis {
    constructor(options) {
      this.points = options.points;
      this.duration = options.duration;
      this.consume = (key) => {
        consumed.push({ key, points: this.points, keyPrefix: options.keyPrefix });
        return consume(key);
      };
    }
  },
}));

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: mockRedisConnect,
    on: vi.fn(),
    set: mockRedisSet,
    eval: mockRedisEval,
  })),
}));

vi.mock('../../services/SettingsService.js', () => ({
  SettingsService: {
    get: mockGetSetting,
  },
}));

import { ANONYMOUS_IP_BACKSTOP_MULTIPLIER, buildRateLimiterIdentity, initializeRateLimiter, rateLimiterMiddleware, rateLimiters } from '../rate-limiter.js';

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
    consumed.length = 0;
    consume.mockReset();
    consume.mockResolvedValue({
      remainingPoints: 59,
      consumedPoints: 1,
      msBeforeNext: 1000
    });
    mockGetSetting.mockImplementation((key) => {
      const settingKey = Array.isArray(key) ? key[0] : key;
      if (settingKey === 'session.rateLimitPersistence') return 'memory';
      if (settingKey === 'session.rateLimitCapacity') return '60';
      if (settingKey === 'session.rateLimitRefillPerSec') return '60';
      if (settingKey === 'session.singleAnonymousChatRunEnabled') return 'true';
      return undefined;
    });
  });

  function anonymousChat(overrides = {}) {
    return {
      method: 'POST',
      originalUrl: '/api/chat/chat-graph-run',
      ip: '203.0.113.10',
      sessionID: 'session-123',
      session: { visitorId: 'visitor-hash-abc' },
      ...overrides,
    };
  }

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

    expect(consumed.map((entry) => entry.key)).toEqual(['visitor:visitor-hash-abc']);
    expect(consumed[0].points).toBe(60);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.rateLimiterSnapshot).toMatchObject({
      authenticated: false,
      keyType: 'visitor',
      remainingPoints: 59,
      points: 60,
    });
  });

  it('does not spend the shared address budget on an ordinary anonymous call', async () => {
    await initializeRateLimiter();

    const first = {
      ip: '203.0.113.10',
      sessionID: 'session-a',
      session: { visitorId: 'visitor-a' },
      headers: { 'x-forwarded-for': '198.51.100.9' },
    };
    const second = {
      ip: '203.0.113.10',
      sessionID: 'session-b',
      session: { visitorId: 'visitor-b' },
    };

    await rateLimiterMiddleware(first, createResponse(), vi.fn());
    await rateLimiterMiddleware(second, createResponse(), vi.fn());

    expect(consumed.map((entry) => entry.key)).toEqual([
      'visitor:visitor-a',
      'visitor:visitor-b',
    ]);
  });

  it('keeps the same address budget when a new cookie starts another chat', async () => {
    await initializeRateLimiter();

    const firstRes = createResponse();
    await rateLimiterMiddleware(anonymousChat({
      sessionID: 'session-a',
      session: { visitorId: 'visitor-a' },
    }), firstRes, vi.fn());
    firstRes.emit('finish');
    const secondRes = createResponse();
    await rateLimiterMiddleware(anonymousChat({
      ip: '::ffff:203.0.113.10',
      sessionID: 'session-b',
      session: { visitorId: 'visitor-b' },
      headers: { 'x-forwarded-for': '198.51.100.4, 203.0.113.99' },
    }), secondRes, vi.fn());
    secondRes.emit('finish');

    const ipCharges = consumed.filter((entry) => entry.key === 'ip:203.0.113.10');
    expect(ipCharges).toHaveLength(2);
    expect(ipCharges[0].points).toBe(60 * ANONYMOUS_IP_BACKSTOP_MULTIPLIER);
    expect(consumed.map((entry) => entry.key)).toEqual([
      'ip:203.0.113.10',
      'visitor:visitor-a',
      'ip:203.0.113.10',
      'visitor:visitor-b',
    ]);
  });

  it('reports the browser allowance when the address pool has fewer points left', async () => {
    consume.mockImplementation((key) => {
      if (String(key).startsWith('ip:')) {
        return Promise.resolve({ remainingPoints: 4, consumedPoints: 1196, msBeforeNext: 8000 });
      }
      return Promise.resolve({ remainingPoints: 59, consumedPoints: 1, msBeforeNext: 1000 });
    });
    await initializeRateLimiter();

    const req = anonymousChat();
    const res = createResponse();
    await rateLimiterMiddleware(req, res, vi.fn());
    res.emit('finish');

    expect(req.rateLimiterSnapshot).toMatchObject({
      keyType: 'visitor',
      remainingPoints: 59,
      consumedPoints: 1,
      points: 60,
      msBeforeNext: 1000,
    });
  });

  it('rejects a new anonymous chat when the address budget is already spent', async () => {
    consume.mockImplementation((key) => {
      if (String(key).startsWith('ip:')) {
        return Promise.reject({ msBeforeNext: 4500, consumedPoints: 1200 });
      }
      return Promise.resolve({ remainingPoints: 59, consumedPoints: 1, msBeforeNext: 1000 });
    });
    await initializeRateLimiter();

    const blockedChat = {
      sessionID: 'brand-new-session',
      session: { visitorId: 'brand-new-visitor' },
    };
    const res = createResponse();
    const next = vi.fn();

    await rateLimiterMiddleware(anonymousChat(blockedChat), res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RATE_LIMITED' }));
    expect(next).not.toHaveBeenCalled();
    expect(consumed.map((entry) => entry.key)).toEqual(['ip:203.0.113.10']);

    consume.mockResolvedValue({ remainingPoints: 59, consumedPoints: 1, msBeforeNext: 1000 });
    const retry = vi.fn();
    const retryRes = createResponse();
    await rateLimiterMiddleware(anonymousChat(blockedChat), retryRes, retry);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retryRes.status).not.toHaveBeenCalled();
    retryRes.emit('finish');
  });

  it('still allows an ordinary call when the address budget is already spent', async () => {
    consume.mockImplementation((key) => {
      if (String(key).startsWith('ip:')) {
        return Promise.reject({ msBeforeNext: 4500, consumedPoints: 1200 });
      }
      return Promise.resolve({ remainingPoints: 59, consumedPoints: 1, msBeforeNext: 1000 });
    });
    await initializeRateLimiter();

    const next = vi.fn();
    await rateLimiterMiddleware({
      ip: '203.0.113.10',
      sessionID: 'session-ordinary',
      session: { visitorId: 'visitor-ordinary' },
    }, createResponse(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(consumed.map((entry) => entry.key)).toEqual(['visitor:visitor-ordinary']);
  });

  it('rate limits authenticated requests by account', async () => {
    await initializeRateLimiter();

    const req = anonymousChat({
      ip: '203.0.113.11',
      sessionID: 'session-456',
      user: { userId: 'user-1', role: 'admin' },
      session: {
        passport: { user: { userId: 'user-1' } },
        visitorId: 'visitor-hash-def'
      }
    });
    const res = createResponse();
    const next = vi.fn();

    await rateLimiterMiddleware(req, res, next);

    expect(consumed.map((entry) => entry.key)).toEqual(['user:user-1']);
    expect(consumed[0].points).toBe(300);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.rateLimiterSnapshot).toMatchObject({ authenticated: true, keyType: 'auth' });
    expect(rateLimiters.authenticated).toMatchObject({ points: 300, duration: 60 });
  });

  it('does not grant the authenticated quota for a passport blob without req.user', async () => {
    await initializeRateLimiter();

    const req = {
      ip: '203.0.113.11',
      sessionID: 'session-stale',
      session: {
        passport: { user: { userId: 'user-1' } },
        visitorId: 'visitor-stale',
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await rateLimiterMiddleware(req, res, next);

    expect(consumed.map((entry) => entry.key)).toEqual(['visitor:visitor-stale']);
    expect(req.rateLimiterSnapshot).toMatchObject({ authenticated: false, keyType: 'visitor' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('charges chat runs with no client IP to one shared bucket', () => {
    const ordinary = buildRateLimiterIdentity({ sessionID: 'session-a', session: {} });
    const first = buildRateLimiterIdentity({
      method: 'POST',
      originalUrl: '/api/chat/chat-graph-run',
      sessionID: 'session-a',
      session: {},
    });
    const second = buildRateLimiterIdentity({
      method: 'POST',
      originalUrl: '/api/chat/chat-graph-run',
      ip: '   ',
      sessionID: 'session-b',
      session: {},
    });

    expect(ordinary.limits.map((limit) => limit.key)).toEqual(['session:session-a']);
    expect(first.limits[0]).toEqual({ key: 'unknown', keyType: 'unknown', bucket: 'public' });
    expect(second.limits[0].key).toBe('unknown');
    expect(first.limits.map((limit) => limit.key)).toEqual(['unknown', 'session:session-a']);

    const numericAccount = buildRateLimiterIdentity({
      user: { userId: 15 },
      sessionID: 'session-a',
      session: {},
    });
    expect(numericAccount.authenticated).toBe(false);
    expect(numericAccount.limits.map((limit) => limit.key)).toEqual(['session:session-a']);

    const readOnly = buildRateLimiterIdentity({
      method: 'GET',
      originalUrl: '/api/chat/chat-graph-run',
      ip: '203.0.113.10',
      sessionID: 'session-a',
      session: { visitorId: 'visitor-a' },
    });
    expect(readOnly.limits.map((limit) => limit.key)).toEqual(['visitor:visitor-a']);
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
      expect.any(String),
      { NX: true, EX: 300 }
    );

    const secondRes = createResponse();
    const secondNext = vi.fn();
    await rateLimiterMiddleware(makeReq(), secondRes, secondNext);
    expect(secondRes.status).toHaveBeenCalledWith(429);
    expect(secondNext).not.toHaveBeenCalled();

    firstRes.emit('finish');
    expect(mockRedisEval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get"'),
      expect.objectContaining({
        keys: ['aianswers:chat-run:visitor:visitor-hash-redis-lock'],
        arguments: expect.any(Array),
      }),
    );
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
