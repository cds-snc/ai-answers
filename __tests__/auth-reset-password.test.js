import { describe, it, expect, vi, beforeEach } from 'vitest';
import resetPasswordHandler from '../api/auth/auth-reset-password.js';
import { hashResetToken } from '../api/auth/reset-token.js';
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

import TrustedDeviceService from '../services/TrustedDeviceService.js';

const TOKEN = 'good-token-from-the-email-link';
const TOKEN_HASH = hashResetToken(TOKEN);

function makeRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  return res;
}

function makeUser(overrides = {}) {
  return {
    _id: 'user-123',
    resetPasswordTokenHash: TOKEN_HASH,
    resetPasswordExpiresAt: new Date(Date.now() + 5 * 60000),
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// findOne(...).read('primary') resolves to the user.
function findsUser(user) {
  const read = vi.fn().mockResolvedValue(user);
  User.findOne.mockReturnValue({ read });
  return read;
}

function submit(code, newPassword = 'newpass123') {
  const res = makeRes();
  return resetPasswordHandler({ body: { email: 'a@b.com', code, newPassword } }, res).then(() => res);
}

describe('Auth Reset Password Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The atomic write that uses up the token finds it by default.
    User.findOneAndUpdate.mockResolvedValue({ _id: 'user-123' });
  });

  it('returns 400 when required fields are missing', async () => {
    const res = makeRes();
    await resetPasswordHandler({ body: { email: 'a@b.com' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('refuses a password shorter than the rule before reading the user or using up the link', async () => {
    const res = await submit(TOKEN, 'short');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PASSWORD_RULE' }));
    expect(User.findOne).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses an email that is not a string before reading the user', async () => {
    const res = makeRes();
    await resetPasswordHandler({
      body: { email: ['a@b.com'], code: TOKEN, newPassword: 'newpass1' }
    }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('refuses a code that is not a string before reading the user', async () => {
    const res = await submit([TOKEN]);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('returns generic 401 when user is not found (no enumeration)', async () => {
    findsUser(null);
    const res = await submit(TOKEN);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RESET_INVALID_CODE', message: 'invalid or expired code' })
    );
  });

  it('reads the user from the primary, not a replica that may lag the token write', async () => {
    const read = findsUser(makeUser());
    const res = await submit(TOKEN);
    expect(read).toHaveBeenCalledWith('primary');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns generic 401 when the user has no reset token', async () => {
    findsUser(makeUser({ resetPasswordTokenHash: null, resetPasswordExpiresAt: null }));
    const res = await submit(TOKEN);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RESET_INVALID_CODE' }));
  });

  it('refuses the right token once it has expired', async () => {
    const user = makeUser({ resetPasswordExpiresAt: new Date(Date.now() - 1000) });
    findsUser(user);
    const res = await submit(TOKEN);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RESET_INVALID_CODE' }));
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
  });

  it('works once: the same link fails after a successful reset', async () => {
    const user = makeUser();
    findsUser(user);
    User.findOneAndUpdate.mockResolvedValueOnce({ _id: 'user-123' }).mockResolvedValueOnce(null);

    const first = await submit(TOKEN);
    expect(first.status).toHaveBeenCalledWith(200);

    const second = await submit(TOKEN, 'anotherpass1');
    expect(second.status).toHaveBeenCalledWith(401);
    expect(second.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RESET_INVALID_CODE' }));
    expect(user.password).toBe('newpass123');
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  it('uses up the token in one write that only matches this token', async () => {
    findsUser(makeUser());
    await submit(TOKEN);
    // Matching on the hash means a newer link, sent since the read, is left
    // alone, and a second submit of this link finds nothing to use up.
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'user-123', resetPasswordTokenHash: TOKEN_HASH },
      { $set: { resetPasswordTokenHash: null, resetPasswordExpiresAt: null } }
    );
  });

  it('refuses without saving when the token was used or replaced since the read', async () => {
    const user = makeUser();
    findsUser(user);
    User.findOneAndUpdate.mockResolvedValue(null);

    const res = await submit(TOKEN);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RESET_INVALID_CODE' }));
    expect(user.save).not.toHaveBeenCalled();
  });

  it('refuses an older link after a new reset was requested', async () => {
    // The newer request replaced the stored hash.
    findsUser(makeUser({ resetPasswordTokenHash: hashResetToken('newer-token') }));
    const res = await submit(TOKEN);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RESET_INVALID_CODE' }));
  });

  it('refuses a wrong token without using up the link or saving', async () => {
    const user = makeUser();
    findsUser(user);

    const res = await submit('wrong-token');

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RESET_INVALID_CODE' }));
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
  });

  it('has no lockout: wrong tries never block the real link', async () => {
    findsUser(makeUser());
    for (let i = 0; i < 10; i += 1) {
      const res = await submit(`wrong-token-${i}`);
      expect(res.status).toHaveBeenCalledWith(401);
    }
    const res = await submit(TOKEN);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('resets the password on a valid token', async () => {
    const user = makeUser();
    findsUser(user);

    const res = await submit(TOKEN);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(user.password).toBe('newpass123');
    expect(user.save).toHaveBeenCalled();
    // Every remembered device needs a 2FA code again.
    expect(TrustedDeviceService.revokeAll).toHaveBeenCalledWith('user-123');
    // Devices are forgotten before the link is used up, and the password is
    // saved after.
    const order = [
      TrustedDeviceService.revokeAll.mock.invocationCallOrder[0],
      User.findOneAndUpdate.mock.invocationCallOrder[0],
      user.save.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('keeps the reset link usable when forgetting devices fails', async () => {
    const user = makeUser();
    findsUser(user);
    TrustedDeviceService.revokeAll.mockRejectedValueOnce(new Error('db down'));

    const res = await submit(TOKEN);

    expect(res.status).toHaveBeenCalledWith(500);
    // Link not used up and nothing saved: the same link works on a retry.
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
  });

  it('keeps remembered devices when the token is wrong', async () => {
    findsUser(makeUser());
    await submit('wrong-token');
    expect(TrustedDeviceService.revokeAll).not.toHaveBeenCalled();
  });
});
