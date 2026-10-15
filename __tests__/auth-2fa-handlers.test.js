import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api/db/db-connect.js', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('../services/SettingsService.js', () => ({
  SettingsService: { get: vi.fn(() => null), toBoolean: vi.fn(() => true) },
}));
vi.mock('../models/user.js', () => ({ User: { findById: vi.fn(), findOne: vi.fn() } }));
vi.mock('../services/TwoFAService.js', () => ({
  CODE_TTL_MS: 10 * 60 * 1000,
  default: { verifyChallenge: vi.fn(), sendChallenge: vi.fn() },
}));

vi.mock('../config/passport.js', () => ({
  default: { authenticate: vi.fn((strategy, cb) => () => cb(null, passwordUser, null)) },
}));
const passwordUser = { _id: { toString: () => '507f1f77bcf86cd799439011' }, email: 'a@canada.ca', role: 'admin', active: true };

import loginHandler from '../api/auth/auth-login.js';
import verifyHandler from '../api/auth/auth-verify-2fa.js';
import sendHandler from '../api/auth/auth-send-2fa.js';
import TwoFAService from '../services/TwoFAService.js';
import { User } from '../models/user.js';

const USER_ID = '507f1f77bcf86cd799439011';

function makeRes() {
  const res = { statusCode: 200 };
  res.status = vi.fn((c) => { res.statusCode = c; return res; });
  res.json = vi.fn(() => res);
  return res;
}

function makeReq({ session = {}, body = {} } = {}) {
  const req = {
    body,
    session: { cookie: {}, ...session },
    login: vi.fn((user, cb) => cb(null)),
  };
  return req;
}

const pendingSession = (over = {}) => ({ pending2FA: { userId: USER_ID, createdAt: Date.now(), ...over } });

describe('auth-verify-2fa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    User.findById.mockResolvedValue({ _id: USER_ID, email: 'a@canada.ca', role: 'admin', active: true, createdAt: new Date() });
  });

  it('rejects when the password step never happened, even with an email and code', async () => {
    const req = makeReq({ body: { email: 'admin@canada.ca', code: '123456' } });
    const res = makeRes();
    await verifyHandler(req, res);
    expect(res.statusCode).toBe(401);
    expect(TwoFAService.verifyChallenge).not.toHaveBeenCalled();
    expect(req.login).not.toHaveBeenCalled();
  });

  it('ignores any email in the body and verifies the user from the session', async () => {
    TwoFAService.verifyChallenge.mockResolvedValue({ success: true });
    const req = makeReq({ session: pendingSession(), body: { email: 'victim@canada.ca', code: '123456' } });
    const res = makeRes();
    await verifyHandler(req, res);
    expect(TwoFAService.verifyChallenge).toHaveBeenCalledWith({ userOrId: USER_ID, code: '123456' });
    expect(User.findOne).not.toHaveBeenCalled();
    expect(req.login).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('rejects a stale pending sign-in', async () => {
    const req = makeReq({ session: pendingSession({ createdAt: Date.now() - 11 * 60 * 1000 }), body: { code: '123456' } });
    const res = makeRes();
    await verifyHandler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, reason: 'expired' });
    expect(req.session.pending2FA).toBeUndefined();
    expect(req.login).not.toHaveBeenCalled();
  });

  it('returns 401 for a wrong code and 429 when locked, without logging in', async () => {
    const req = makeReq({ session: pendingSession(), body: { code: '000000' } });
    TwoFAService.verifyChallenge.mockResolvedValueOnce({ success: false, reason: 'invalid' });
    const res1 = makeRes();
    await verifyHandler(req, res1);
    expect(res1.statusCode).toBe(401);
    expect(res1.json).toHaveBeenCalledWith({ success: false, reason: 'invalid' });

    TwoFAService.verifyChallenge.mockResolvedValueOnce({ success: false, reason: 'locked' });
    const res2 = makeRes();
    await verifyHandler(req, res2);
    expect(res2.statusCode).toBe(429);
    expect(req.login).not.toHaveBeenCalled();
  });

  it('does not log in a user who was deactivated after the password step', async () => {
    TwoFAService.verifyChallenge.mockResolvedValue({ success: true });
    User.findById.mockResolvedValue({ _id: USER_ID, active: false });
    const req = makeReq({ session: pendingSession(), body: { code: '123456' } });
    const res = makeRes();
    await verifyHandler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, reason: 'expired' });
    expect(req.login).not.toHaveBeenCalled();
  });
});

describe('auth-send-2fa (resend)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects callers who have not passed the password step', async () => {
    const res = makeRes();
    await sendHandler(makeReq({ body: { email: 'victim@canada.ca' } }), res);
    expect(res.statusCode).toBe(401);
    expect(TwoFAService.sendChallenge).not.toHaveBeenCalled();
  });

  it('resends to the session user, never to an email from the body', async () => {
    TwoFAService.sendChallenge.mockResolvedValue({ success: true });
    const res = makeRes();
    await sendHandler(makeReq({ session: pendingSession(), body: { email: 'victim@canada.ca' } }), res);
    expect(TwoFAService.sendChallenge).toHaveBeenCalledWith({ userOrId: USER_ID, resend: true });
    expect(res.statusCode).toBe(200);
  });

  it('returns 429 on cooldown or lockout', async () => {
    for (const reason of ['cooldown', 'locked']) {
      TwoFAService.sendChallenge.mockResolvedValueOnce({ success: false, reason });
      const res = makeRes();
      await sendHandler(makeReq({ session: pendingSession() }), res);
      expect(res.statusCode).toBe(429);
    }
  });

  it('sends the user back to sign in when the pending sign-in is stale or the user is gone', async () => {
    const stale = makeReq({ session: pendingSession({ createdAt: Date.now() - 11 * 60 * 1000 }) });
    const res1 = makeRes();
    await sendHandler(stale, res1);
    expect(res1.statusCode).toBe(401);
    expect(res1.json).toHaveBeenCalledWith({ success: false, reason: 'expired' });
    expect(TwoFAService.sendChallenge).not.toHaveBeenCalled();

    TwoFAService.sendChallenge.mockResolvedValueOnce({ success: false, reason: 'not_found' });
    const gone = makeReq({ session: pendingSession() });
    const res2 = makeRes();
    await sendHandler(gone, res2);
    expect(res2.statusCode).toBe(401);
    expect(res2.json).toHaveBeenCalledWith({ success: false, reason: 'expired' });
    expect(gone.session.pending2FA).toBeUndefined();
  });

  it('reports send_failed, and nothing internal, when the email fails or throws', async () => {
    TwoFAService.sendChallenge.mockResolvedValueOnce({ success: false, reason: 'send_failed' });
    const res1 = makeRes();
    await sendHandler(makeReq({ session: pendingSession() }), res1);
    expect(res1.statusCode).toBe(500);
    expect(res1.json).toHaveBeenCalledWith({ success: false, reason: 'send_failed' });

    TwoFAService.sendChallenge.mockRejectedValueOnce(Object.assign(new Error('db down'), { code: 11000 }));
    const res2 = makeRes();
    await sendHandler(makeReq({ session: pendingSession() }), res2);
    expect(res2.statusCode).toBe(500);
    expect(res2.json).toHaveBeenCalledWith({ success: false, reason: 'send_failed' });
  });
});

describe('auth-login with 2FA on', () => {
  const realEnv = process.env.NODE_ENV;
  beforeEach(() => {
    vi.clearAllMocks();
    // auth-login skips 2FA when NODE_ENV is 'test'.
    process.env.NODE_ENV = 'development';
  });
  afterEach(() => { process.env.NODE_ENV = realEnv; });

  async function login() {
    const req = makeReq();
    const res = makeRes();
    await loginHandler(req, res, vi.fn());
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());
    return { req, res };
  }

  it('says 2FA is locked, rather than "invalid credentials", after a correct password', async () => {
    TwoFAService.sendChallenge.mockResolvedValue({ success: false, reason: 'locked' });
    const { req, res } = await login();
    expect(res.statusCode).toBe(429);
    expect(res.json.mock.calls[0][0].reason).toBe('locked');
    expect(req.session.pending2FA).toBeUndefined();
  });

  it('reports send_failed and never a database error code', async () => {
    TwoFAService.sendChallenge.mockRejectedValue(Object.assign(new Error('db'), { code: 11000 }));
    const { res } = await login();
    expect(res.statusCode).toBe(500);
    expect(res.json.mock.calls[0][0]).toMatchObject({ reason: 'send_failed', detail: 'twofa_send_error' });
  });

  it("keeps TwoFAService's own fixed code in detail, for the Network tab", async () => {
    TwoFAService.sendChallenge.mockRejectedValue(Object.assign(new Error('no key'), { code: 'twofa_no_secret' }));
    const { res } = await login();
    expect(res.json.mock.calls[0][0]).toMatchObject({ reason: 'send_failed', detail: 'twofa_no_secret' });
  });
});
