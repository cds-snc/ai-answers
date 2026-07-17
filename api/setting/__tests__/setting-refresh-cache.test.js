import { describe, expect, it, vi } from 'vitest';
import handler from '../setting-refresh-cache.js';

const mockRefreshCache = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../../services/SettingsService.js', () => ({
  SettingsService: {
    refreshCache: mockRefreshCache,
  },
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
  it('refreshes the settings cache for admin users', async () => {
    const res = createRes();

    await handler(createReq(), res);

    expect(mockRefreshCache).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ message: 'Settings cache refreshed' });
  });
});
