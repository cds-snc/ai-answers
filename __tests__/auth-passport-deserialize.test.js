import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/db/db-connect.js', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('../models/user.js', () => ({
  User: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), findById: vi.fn() },
}));

import passport from '../config/passport.js';
import { User } from '../models/user.js';

// Runs passport's registered deserializer on what the session stored.
const deserialize = (sessionUser) => new Promise((resolve, reject) =>
  passport.deserializeUser(sessionUser, (err, user) => (err ? reject(err) : resolve(user))));

const session = { userId: 'u1', email: 'a@canada.ca', role: 'admin' };

describe('deserializeUser (AIA-015)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the role in the database, not the one stored at sign-in', async () => {
    // An admin demoted to partner while signed in must lose admin on the next request.
    User.findById.mockResolvedValue({ _id: 'u1', email: 'a@canada.ca', role: 'partner', active: true });
    expect(await deserialize(session)).toEqual({ userId: 'u1', email: 'a@canada.ca', role: 'partner' });
    expect(User.findById).toHaveBeenCalledWith('u1');
  });

  it('keeps the { userId, email, role } shape and leaks no other user fields', async () => {
    User.findById.mockResolvedValue({
      _id: { toString: () => 'u1' }, email: 'new@canada.ca', role: 'admin', active: true,
      password: 'hash', resetPasswordSecret: 'secret', institution: 'ESDC',
    });
    expect(await deserialize(session)).toEqual({ userId: 'u1', email: 'new@canada.ca', role: 'admin' });
  });

  it('signs out an inactive user', async () => {
    User.findById.mockResolvedValue({ _id: 'u1', email: 'a@canada.ca', role: 'admin', active: false });
    expect(await deserialize(session)).toBe(false);
  });

  it('signs out a deleted user', async () => {
    User.findById.mockResolvedValue(null);
    expect(await deserialize(session)).toBe(false);
  });

  it('fails on a database error instead of falling back to the session copy', async () => {
    // A fallback to the session would bring the stale role back whenever the database hiccups.
    User.findById.mockRejectedValue(new Error('db down'));
    await expect(deserialize(session)).rejects.toThrow('db down');
  });
});
