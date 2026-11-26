import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import createSessionMiddleware, { resolveSessionSecret } from '../express-session.js';

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

// AIA-004: a missing session secret must fail closed in a deployed environment.
describe('resolveSessionSecret', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SESSION_SECRET;
    mockGetSetting.mockImplementation(() => undefined);
  });

  // Tests here switch NODE_ENV to production; never let that leak into later suites.
  afterEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.SESSION_SECRET;
  });

  it('prefers SESSION_SECRET from the environment over the database setting', () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'from-env';
    mockGetSetting.mockImplementation((key) => (key === 'session.secret' ? 'from-setting' : undefined));
    expect(resolveSessionSecret()).toBe('from-env');
  });

  it('falls back to the session.secret setting when the environment has none', () => {
    process.env.NODE_ENV = 'production';
    mockGetSetting.mockImplementation((key) => (key === 'session.secret' ? 'from-setting' : undefined));
    expect(resolveSessionSecret()).toBe('from-setting');
  });

  it('uses SESSION_SECRET from the environment', () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'from-env';
    expect(resolveSessionSecret()).toBe('from-env');
  });

  it('throws in production when no secret is set', () => {
    process.env.NODE_ENV = 'production';
    expect(() => resolveSessionSecret()).toThrow(/SESSION_SECRET is not set/);
  });

  it('throws when NODE_ENV is unset, because that counts as deployed', () => {
    delete process.env.NODE_ENV;
    expect(() => resolveSessionSecret()).toThrow(/SESSION_SECRET is not set/);
  });

  it('uses a random secret that lasts for the process in test and development', () => {
    process.env.NODE_ENV = 'test';
    const first = resolveSessionSecret();
    process.env.NODE_ENV = 'development';
    const second = resolveSessionSecret();
    process.env.NODE_ENV = 'test';

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
    expect(first).not.toBe('change-me-session-secret');
  });
});
