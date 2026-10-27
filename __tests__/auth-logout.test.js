import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/TrustedDeviceService.js', () => ({ default: { forget: vi.fn() } }));

import logoutHandler from '../api/auth/auth-logout.js';
import TrustedDeviceService from '../services/TrustedDeviceService.js';

function makeReq() {
  return {
    logout: vi.fn((cb) => cb(null)),
    session: { destroy: vi.fn((cb) => cb(null)) },
  };
}

function makeRes() {
  const res = { statusCode: 200 };
  res.status = vi.fn((c) => { res.statusCode = c; return res; });
  res.json = vi.fn(() => res);
  return res;
}

describe('auth-logout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forgets this browser, so the next sign-in here asks for a code', async () => {
    const req = makeReq();
    const res = makeRes();
    await logoutHandler(req, res);
    expect(TrustedDeviceService.forget).toHaveBeenCalledWith(req, res);
    expect(req.logout).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('still signs out when forgetting the device fails', async () => {
    TrustedDeviceService.forget.mockRejectedValueOnce(new Error('db down'));
    const req = makeReq();
    const res = makeRes();
    await logoutHandler(req, res);
    expect(req.logout).toHaveBeenCalled();
    expect(req.session.destroy).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
