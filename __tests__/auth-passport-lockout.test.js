import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/db/db-connect.js', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('../models/user.js', () => ({
  User: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), findById: vi.fn() },
}));

import passport, { MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_MS } from '../config/passport.js';
import { User } from '../models/user.js';

const verify = passport._strategy('local')._verify;
const run = (email, password) => new Promise((resolve, reject) =>
  verify(email, password, (err, user, info) => (err ? reject(err) : resolve({ user, info }))));

function makeUser(over = {}) {
  return {
    _id: 'u1', email: 'a@canada.ca', active: true, loginAttempts: 0, loginLockedUntil: null,
    comparePassword: vi.fn().mockResolvedValue(true), ...over,
  };
}

describe('password sign-in lockout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('signs in with the right password and clears old failures', async () => {
    User.findOne.mockResolvedValue(makeUser({ loginAttempts: 3 }));
    const { user } = await run('A@Canada.ca', 'pw');
    expect(user).toBeTruthy();
    expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { loginAttempts: 0, loginLockedUntil: null } });
  });

  it('counts a wrong password without locking below the limit', async () => {
    User.findOne.mockResolvedValue(makeUser({ comparePassword: vi.fn().mockResolvedValue(false) }));
    User.findOneAndUpdate.mockResolvedValue({ loginAttempts: 1 });
    const { user, info } = await run('a@canada.ca', 'bad');
    expect(user).toBe(false);
    expect(info.message).toBe('Invalid credentials');
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it('locks the account on the MAX_LOGIN_ATTEMPTS-th failure', async () => {
    User.findOne.mockResolvedValue(makeUser({ comparePassword: vi.fn().mockResolvedValue(false) }));
    User.findOneAndUpdate.mockResolvedValue({ loginAttempts: MAX_LOGIN_ATTEMPTS });
    await run('a@canada.ca', 'bad');
    const [, update] = User.updateOne.mock.calls[0];
    expect(update.$set.loginAttempts).toBe(0);
    expect(update.$set.loginLockedUntil.getTime()).toBeGreaterThan(Date.now() + LOGIN_LOCKOUT_MS - 5000);
  });

  it('rejects the right password while locked, with the same message', async () => {
    const comparePassword = vi.fn().mockResolvedValue(true);
    User.findOne.mockResolvedValue(makeUser({ comparePassword, loginLockedUntil: new Date(Date.now() + 60000) }));
    const { user, info } = await run('a@canada.ca', 'right');
    expect(user).toBe(false);
    expect(info.message).toBe('Invalid credentials');
    expect(comparePassword).not.toHaveBeenCalled();
  });

  it('answers an unknown email exactly like a wrong password', async () => {
    User.findOne.mockResolvedValue(null);
    const { user, info } = await run('nobody@canada.ca', 'x');
    expect(user).toBe(false);
    expect(info.message).toBe('Invalid credentials');
  });

  it('only reveals a deactivated account after the correct password', async () => {
    User.findOne.mockResolvedValue(makeUser({ active: false, comparePassword: vi.fn().mockResolvedValue(false) }));
    User.findOneAndUpdate.mockResolvedValue({ loginAttempts: 1 });
    expect((await run('a@canada.ca', 'bad')).info.message).toBe('Invalid credentials');

    User.findOne.mockResolvedValue(makeUser({ active: false }));
    expect((await run('a@canada.ca', 'right')).info.message).toBe('Account is deactivated');
  });
});
