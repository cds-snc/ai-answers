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

vi.mock('speakeasy', () => ({
  default: {
    totp: {
      verify: vi.fn()
    }
  }
}));

import speakeasy from 'speakeasy';

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

  it('returns generic 401 when user is not found (no enumeration)', async () => {
    User.findOne.mockResolvedValue(null);
    const res = makeRes();
    await resetPasswordHandler({
      body: { email: 'no@user.com', code: '123456', newPassword: 'newpass' }
    }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'invalid or expired code' })
    );
  });

  it('returns generic 401 when user has no resetPasswordSecret', async () => {
    User.findOne.mockResolvedValue({ resetPasswordSecret: null, resetPasswordAttempts: 0 });
    const res = makeRes();
    await resetPasswordHandler({
      body: { email: 'a@b.com', code: '123456', newPassword: 'newpass' }
    }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'invalid or expired code' })
    );
  });

  it('returns 429 with user-facing message when locked out', async () => {
    const lockedUntil = new Date(Date.now() + 20 * 60000); // 20 min from now
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
      body: { email: 'a@b.com', code: '123456', newPassword: 'newpass' }
    }, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'RESET_LOCKED_OUT',
      })
    );
    // Should NOT have tried to verify the code
    expect(speakeasy.totp.verify).not.toHaveBeenCalled();
  });

  it('clears expired lockout and allows verification', async () => {
    const expiredLock = new Date(Date.now() - 1000); // 1 second ago
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

    // Should have cleared the lockout
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
      body: { email: 'a@b.com', code: '999999', newPassword: 'newpass' }
    }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'user-123', resetPasswordSecret: { $ne: null } },
      { $inc: { resetPasswordAttempts: 1 } },
      { new: true }
    );
  });

  it('sets timed lockout when attempts reach MAX', async () => {
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
      body: { email: 'a@b.com', code: '999999', newPassword: 'newpass' }
    }, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'RESET_LOCKED_OUT',
      })
    );
    // Should set lockout via updateOne
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
  });
});
