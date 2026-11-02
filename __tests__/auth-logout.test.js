import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/TrustedDeviceService.js', () => ({ default: { forget: vi.fn() } }));

import logoutHandler from '../api/auth/auth-logout.js';
import TrustedDeviceService from '../services/TrustedDeviceService.js';

function makeReq(body = { forgetDevice: true }) {
  return {
    body,
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

  // Whether or not the session is still alive: on a shared computer the user
  // may click Sign out after it has already timed out.
  it('forgets this browser when the user signs out, so the next sign-in here asks for a code', async () => {
    const req = makeReq();
    const res = makeRes();
    await logoutHandler(req, res);
    expect(TrustedDeviceService.forget).toHaveBeenCalledWith(req, res);
    expect(req.logout).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  // The client also calls auth-logout when the session ends on its own (a 401,
  // or its expiry timer). Those calls don't send forgetDevice, and must not
  // forget the device, or it never skips the code.
  it.each([[{}], [{ forgetDevice: false }], [{ forgetDevice: 'true' }], [null]])(
    'keeps the device when the sign-out was not chosen by the user (%j)', async (body) => {
    const req = makeReq(body);
    const res = makeRes();
    await logoutHandler(req, res);
    expect(TrustedDeviceService.forget).not.toHaveBeenCalled();
    expect(req.session.destroy).toHaveBeenCalled();
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
