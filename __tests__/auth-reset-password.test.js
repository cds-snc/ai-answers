import { describe, it, expect, vi, beforeEach } from 'vitest';
import resetPasswordHandler from '../api/auth/auth-reset-password.js';
import { User } from '../models/user.js';

vi.mock('../models/user.js', () => {
  const UserMock = vi.fn();
  UserMock.findOne = vi.fn();
  UserMock.updateOne = vi.fn().mockResolvedValue({});
  UserMock.findOneAndUpdate = vi.fn();
  return { User: UserMock };
});

vi.mock('../api/db/db-connect.js', () => ({
  default: vi.fn().mockResolvedValue(true)
}));

vi.mock('../services/TrustedDeviceService.js', () => ({
  default: { revokeAll: vi.fn() }
}));

vi.mock('speakeasy', () => ({
  default: {
    totp: {
      verify: vi.fn()
    }
  }
}));

import speakeasy from 'speakeasy';
import TrustedDeviceService from '../services/TrustedDeviceService.js';

function makeRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  return res;
}

describe('Auth Reset Password Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = makeRes();
    await resetPasswordHandler({ body: { email: 'a@b.com' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('refuses a password shorter than the rule before reading the user or counting an attempt', async () => {
    const res = makeRes();
    await resetPasswordHandler({
      body: { email: 'a@b.com', code: '123456', newPassword: 'short' }
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PASSWORD_RULE' }));
    expect(User.findOne).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses an email that is not a string before reading the user', async () => {
    const res = makeRes();
    await resetPasswordHandler({
      body: { email: ['a@b.com'], code: '123456', newPassword: 'newpass1' }
    }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('returns generic 401 when user is not found (no enumeration)', async () => {
    User.findOne.mockResolvedValue(null);
    const res = makeRes();
    await resetPasswordHandler({
      body: { email: 'no@user.com', code: '123456', newPassword: 'newpass1' }
    }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RESET_INVALID_CODE', message: 'invalid or expired code' })
    );
  });

  it('returns generic 401 when user has no resetPasswordSecret', async () => {
    User.findOne.mockResolvedValue({ resetPasswordSecret: null, resetPasswordAttempts: 0 });
    const res = makeRes();
    await resetPasswordHandler({
      body: { email: 'a@b.com', code: '123456', newPassword: 'newpass1' }
    }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RESET_INVALID_CODE' })
    );
  });

  it('returns 429 with RESET_LOCKED_OUT when account is locked', async () => {
    const lockedUntil = new Date(Date.now() + 20 * 60000);
    const user = {
      _id: 'user-123',
      resetPasswordSecret: 'secret',
      resetPasswordAttempts: 5,
      resetPasswordLockedUntil: lockedUntil,
      save: vi.fn(),
    };
    User.findOne.mockResolvedValue(user);

    const res = makeRes();
    await resetPasswordHandler({
      body: { email: 'a@b.com', code: '123456', newPassword: 'newpass1' }
    }, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RESET_LOCKED_OUT' })
    );
    // Should not have attempted TOTP verification
    expect(speakeasy.totp.verify).not.toHaveBeenCalled();
  });

  it('clears expired lockout and allows verification', async () => {
    const expiredLock = new Date(Date.now() - 1000);
    const user = {
      _id: 'user-123',
      resetPasswordSecret: 'secret',
      resetPasswordAttempts: 5,
      resetPasswordLockedUntil: expiredLock,
      save: vi.fn().mockResolvedValue(true),
    };
    User.findOne.mockResolvedValue(user);
    speakeasy.totp.verify.mockReturnValue(true);

    const res = makeRes();
    await resetPasswordHandler({
      body: { email: 'a@b.com', code: '123456', newPassword: 'newpass123' }
    }, res);

    // Should have cleared the stale lockout
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: 'user-123' },
      { $set: { resetPasswordAttempts: 0, resetPasswordLockedUntil: null } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(user.password).toBe('newpass123');
  });

  it('atomically increments resetPasswordAttempts on invalid code', async () => {
    const user = {
      _id: 'user-123',
      resetPasswordSecret: 'secret',
      resetPasswordAttempts: 2,
      resetPasswordLockedUntil: null,
      save: vi.fn().mockResolvedValue(true),
    };
    User.findOne.mockResolvedValue(user);
    speakeasy.totp.verify.mockReturnValue(false);
    User.findOneAndUpdate.mockResolvedValue({ resetPasswordAttempts: 3 });

    const res = makeRes();
    await resetPasswordHandler({
      body: { email: 'a@b.com', code: '999999', newPassword: 'newpass1' }
    }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RESET_INVALID_CODE' })
    );
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'user-123', resetPasswordSecret: 'secret' },
      { $inc: { resetPasswordAttempts: 1 } },
      { new: true }
    );
  });

  it('sets timed lockout when attempts reach MAX_RESET_ATTEMPTS', async () => {
    const user = {
      _id: 'user-123',
      resetPasswordSecret: 'secret',
      resetPasswordAttempts: 4,
      resetPasswordLockedUntil: null,
      save: vi.fn().mockResolvedValue(true),
    };
    User.findOne.mockResolvedValue(user);
    speakeasy.totp.verify.mockReturnValue(false);
    User.findOneAndUpdate.mockResolvedValue({ resetPasswordAttempts: 5 });

    const res = makeRes();
    await resetPasswordHandler({
      body: { email: 'a@b.com', code: '999999', newPassword: 'newpass1' }
    }, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RESET_LOCKED_OUT' })
    );
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: 'user-123' },
      { $set: { resetPasswordLockedUntil: expect.any(Date) } }
    );
  });

  it('resets password and clears all reset state on valid code', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const user = {
      _id: 'user-123',
      resetPasswordSecret: 'secret',
      resetPasswordAttempts: 1,
      resetPasswordLockedUntil: null,
      save,
    };
    User.findOne.mockResolvedValue(user);
    speakeasy.totp.verify.mockReturnValue(true);

    const res = makeRes();
    await resetPasswordHandler({
      body: { email: 'a@b.com', code: '123456', newPassword: 'newpass123' }
    }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(user.password).toBe('newpass123');
    expect(user.resetPasswordSecret).toBeNull();
    expect(user.resetPasswordAttempts).toBe(0);
    expect(user.resetPasswordLockedUntil).toBeNull();
    expect(save).toHaveBeenCalled();
    // Every remembered device needs a 2FA code again.
    expect(TrustedDeviceService.revokeAll).toHaveBeenCalledWith('user-123');
  });

  it('keeps the reset link usable when forgetting devices fails', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const user = { _id: 'user-123', resetPasswordSecret: 'secret', resetPasswordAttempts: 0, save };
    User.findOne.mockResolvedValue(user);
    speakeasy.totp.verify.mockReturnValue(true);
    TrustedDeviceService.revokeAll.mockRejectedValueOnce(new Error('db down'));

    const res = makeRes();
    await resetPasswordHandler({
      body: { email: 'a@b.com', code: '123456', newPassword: 'newpass123' }
    }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    // Nothing saved: the same link and code work on a retry.
    expect(save).not.toHaveBeenCalled();
    expect(user.resetPasswordSecret).toBe('secret');
  });

  it('keeps remembered devices when the code is wrong', async () => {
    User.findOne.mockResolvedValue({ _id: 'user-123', resetPasswordSecret: 'secret', resetPasswordAttempts: 0 });
    User.findOneAndUpdate.mockResolvedValue({ resetPasswordAttempts: 1 });
    speakeasy.totp.verify.mockReturnValue(false);
    await resetPasswordHandler({
      body: { email: 'a@b.com', code: '000000', newPassword: 'newpass123' }
    }, makeRes());
    expect(TrustedDeviceService.revokeAll).not.toHaveBeenCalled();
  });
});
