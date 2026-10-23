import { describe, it, expect, afterEach, vi } from 'vitest';
import handler from '../user-users.js';
import dbConnect from '../../db/db-connect.js';
import { User } from '../../../models/user.js';
import UserService from '../../../services/UserService.js';

// The Users page only needs these. Everything else on a user document -
// resetPasswordSecret, 2FA codes, lockout counters - must never reach the
// browser, so both responses that feed the page are checked against an
// exact key list rather than for the absence of a few known secrets.
const ALLOWED = ['_id', 'active', 'createdAt', 'email', 'group', 'institution', 'role'];

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    setHeader: () => {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

async function run(method, { body, user }) {
  const res = createRes();
  await handler({ method, body, query: {}, path: '/api/user/user-users', user, isAuthenticated: () => true }, res);
  // Serialize like Express would, so a Mongoose document is judged by what
  // actually goes over the wire.
  return { ...res, payload: JSON.parse(JSON.stringify(res.payload)) };
}

async function makeUserWithSecrets(overrides = {}) {
  return User.create({
    email: `fields-${Date.now()}-${Math.random()}@example.com`,
    password: 'password123',
    role: 'partner',
    active: true,
    resetPasswordSecret: 'reset-secret',
    resetPasswordAttempts: 2,
    twoFACode: 'hashed-code',
    twoFASecret: 'legacy-secret',
    twoFAAttempts: 1,
    loginAttempts: 3,
    ...overrides
  });
}

describe('user-users only returns the fields the Users page uses', () => {
  afterEach(async () => {
    await User.deleteMany({ email: /^fields-/ });
  });

  it('GET lists users without secrets or counters', async () => {
    await dbConnect();
    const admin = await makeUserWithSecrets({ role: 'admin' });
    const target = await makeUserWithSecrets();

    const res = await run('GET', { user: { role: 'admin', userId: admin._id.toString() } });

    expect(res.statusCode).toBe(200);
    const row = res.payload.find(u => u._id === target._id.toString());
    expect(row).toBeDefined();
    for (const u of res.payload) {
      expect(Object.keys(u).filter(k => !ALLOWED.includes(k))).toEqual([]);
    }
    expect(row.email).toBe(target.email);
  });

  it('PATCH returns the updated user without secrets or counters', async () => {
    await dbConnect();
    const admin = await makeUserWithSecrets({ role: 'admin' });
    const target = await makeUserWithSecrets();

    const res = await run('PATCH', {
      body: { userId: target._id.toString(), active: false },
      user: { role: 'admin', userId: admin._id.toString() }
    });

    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.payload).filter(k => !ALLOWED.includes(k))).toEqual([]);
    expect(res.payload.active).toBe(false);
    expect(res.payload._id).toBe(target._id.toString());
  });
});

describe('user-users 500 responses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not send the internal error message to the browser', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(UserService, 'listUsers').mockRejectedValue(new Error('internal detail'));

    const res = await run('GET', { user: { role: 'admin', userId: '000000000000000000000000' } });

    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ message: 'Failed to retrieve users' });
  });
});
