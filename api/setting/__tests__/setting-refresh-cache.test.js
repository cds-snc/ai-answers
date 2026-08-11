import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../setting-refresh-cache.js';

const mockRefreshCache = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRecordAction = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockLogError = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../../services/SettingsService.js', () => ({
  SettingsService: {
    refreshCache: mockRefreshCache,
  },
}));

vi.mock('../../../services/SettingsAuditService.js', () => ({
  default: { recordAction: mockRecordAction },
}));

vi.mock('../../../services/ServerLoggingService.js', () => ({
  default: { error: mockLogError, info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function createReq() {
  return {
    method: 'POST',
    path: '/api/setting/setting-refresh-cache',
    user: { role: 'admin', userId: 'admin-test' },
    isAuthenticated: () => true,
  };
}

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe('setting-refresh-cache handler', () => {
  beforeEach(() => {
    mockRefreshCache.mockClear();
    mockRecordAction.mockReset();
    mockRecordAction.mockResolvedValue(undefined);
    mockLogError.mockClear();
  });

  it('still reports success when the audit write fails', async () => {
    const res = createRes();
    mockRecordAction.mockRejectedValue(new Error('audit collection unavailable'));

    // The cache has already been refreshed at this point — failing the request
    // would tell the admin the refresh did not happen when it did.
    await handler(createReq(), res);

    expect(mockRefreshCache).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ message: 'Settings cache refreshed' });
    expect(mockLogError).toHaveBeenCalled();
  });

  it('refreshes the settings cache for admin users', async () => {
    const res = createRes();

    await handler(createReq(), res);

    expect(mockRefreshCache).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ message: 'Settings cache refreshed' });
  });
});
