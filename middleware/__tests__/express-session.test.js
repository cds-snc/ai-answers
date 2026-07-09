import { beforeEach, describe, expect, it, vi } from 'vitest';
import createSessionMiddleware from '../express-session.js';

const {
  mockSessionFactory,
  mockSessionHandler,
  mockMemoryStore,
  mockGetSetting,
  mockDbConnect,
  mockGetParentDomain,
} = vi.hoisted(() => ({
  mockSessionHandler: vi.fn((req, res, next) => next()),
  mockMemoryStore: vi.fn(function MockMemoryStore() {
    this.type = 'memory-store';
  }),
  mockSessionFactory: vi.fn(() => mockSessionHandler),
  mockGetSetting: vi.fn((keys) => {
    const key = Array.isArray(keys) ? keys[0] : keys;
    if (key === 'session.type') return 'memory';
    if (key === 'session.secret') return 'test-secret';
    if (key === 'session.defaultTTLMinutes') return '60';
    if (key === 'session.authenticatedTTLMinutes') return '1';
    return undefined;
  }),
  mockDbConnect: vi.fn(() => Promise.resolve()),
  mockGetParentDomain: vi.fn(() => undefined),
}));

vi.mock('express-session', () => ({
  default: Object.assign(mockSessionFactory, {
    MemoryStore: mockMemoryStore,
  }),
}));

vi.mock('connect-mongo', () => ({
  default: {
    create: vi.fn(() => ({ type: 'mongo-store' })),
  },
}));

vi.mock('connect-redis', () => ({
  RedisStore: vi.fn(() => ({ type: 'redis-store' })),
}));

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    on: vi.fn(),
    connect: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('../../services/SettingsService.js', () => ({
  SettingsService: {
    get: mockGetSetting,
  },
}));

vi.mock('../../api/db/db-connect.js', () => ({
  default: mockDbConnect,
}));

vi.mock('../../api/util/cookie-utils.js', () => ({
  getParentDomain: mockGetParentDomain,
}));

describe('express-session middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete process.env.SESSION_TTL_MINUTES;
    delete process.env.SESSION_AUTH_TTL_MINUTES;
    delete process.env.SESSION_TYPE;
    delete process.env.SESSION_STORE;
    delete process.env.SESSION_SECRET;
  });

  it('builds successfully and applies default and authenticated ttl values', () => {
    const app = { set: vi.fn() };
    const middleware = createSessionMiddleware(app);
    const res = {
      writeHead: vi.fn((...args) => args),
      getHeader: vi.fn(() => undefined),
      setHeader: vi.fn(),
    };

    const unauthReq = {
      session: { cookie: {} },
      get: vi.fn(() => undefined),
    };
    const unauthNext = vi.fn();

    expect(() => middleware(unauthReq, res, unauthNext)).not.toThrow();

    expect(mockSessionFactory).toHaveBeenCalledTimes(1);
    expect(mockSessionFactory.mock.calls[0][0].cookie.maxAge).toBe(60 * 60 * 1000);
    expect(unauthReq.session.cookie.maxAge).toBe(60 * 60 * 1000);
    expect(unauthNext).toHaveBeenCalledTimes(1);
    expect(app.set).toHaveBeenCalledWith('trust proxy', 1);

    const authReq = {
      session: {
        passport: { user: 'abc' },
        cookie: {},
      },
      get: vi.fn(() => undefined),
    };
    const authNext = vi.fn();

    expect(() => middleware(authReq, res, authNext)).not.toThrow();

    expect(authReq.session.cookie.maxAge).toBe(1 * 60 * 1000);
    expect(authNext).toHaveBeenCalledTimes(1);
  });
});
