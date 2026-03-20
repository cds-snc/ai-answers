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

  it('atomically increments resetPasswordAttempts on invalid code', async () => {
    const user = {
      _id: 'user-123',
      resetPasswordSecret: 'secret',
      resetPasswordAttempts: 2,
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

  it('invalidates secret when attempts reach MAX after atomic increment', async () => {
    const user = {
      _id: 'user-123',
      resetPasswordSecret: 'secret',
      resetPasswordAttempts: 4,
      save: vi.fn().mockResolvedValue(true),
    };
    User.findOne.mockResolvedValue(user);
    speakeasy.totp.verify.mockReturnValue(false);
    // After $inc, attempts becomes 5 (the max)
    User.findOneAndUpdate.mockResolvedValue({ resetPasswordAttempts: 5 });

    const res = makeRes();
    await resetPasswordHandler({
      body: { email: 'a@b.com', code: '999999', newPassword: 'newpass' }
    }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    // Should have called updateOne to nullify the secret
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: 'user-123' },
      { $set: { resetPasswordSecret: null, resetPasswordAttempts: 0 } }
    );
  });

  it('invalidates secret when attempts already at MAX on entry', async () => {
    const user = {
      _id: 'user-123',
      resetPasswordSecret: 'secret',
      resetPasswordAttempts: 5,
      save: vi.fn().mockResolvedValue(true),
    };
    User.findOne.mockResolvedValue(user);

    const res = makeRes();
    await resetPasswordHandler({
      body: { email: 'a@b.com', code: '123456', newPassword: 'newpass' }
    }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: 'user-123' },
      { $set: { resetPasswordSecret: null, resetPasswordAttempts: 0 } }
    );
    // Should NOT have called speakeasy.totp.verify
    expect(speakeasy.totp.verify).not.toHaveBeenCalled();
  });

  it('resets password and clears secret on valid code', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const user = {
      _id: 'user-123',
      resetPasswordSecret: 'secret',
      resetPasswordAttempts: 1,
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
    expect(save).toHaveBeenCalled();
  });
});
