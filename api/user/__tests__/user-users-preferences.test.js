import { describe, it, expect } from 'vitest';
import handler from '../user-users.js';
import dbConnect from '../../db/db-connect.js';
import { User } from '../../../models/user.js';

// Focused on the institution/group -> prefilter-preference clearing
// invariant added to the admin PATCH path - not a full endpoint suite,
// which doesn't exist yet for this file.

function createReq({ body, user }) {
  return {
    method: 'PATCH',
    body,
    path: '/api/user/user-users',
    user,
    isAuthenticated: () => true
  };
}

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

async function runPatch(body, user) {
  const res = createRes();
  await handler(createReq({ body, user }), res);
  return res;
}

async function makeUser(overrides = {}) {
  return User.create({ email: `users-${Date.now()}-${Math.random()}@example.com`, password: 'password123', role: 'partner', active: true, ...overrides });
}

describe('user-users PATCH clears stale prefilter preferences', () => {
  it('clears prefilterDepartment when an admin clears a user\'s institution', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const target = await makeUser({ institution: 'IRCC', preferences: { prefilterDepartment: true } });

    const res = await runPatch(
      { userId: target._id.toString(), institution: '' },
      { role: 'admin', userId: admin._id.toString() }
    );

    expect(res.statusCode).toBe(200);
    const updated = await User.findById(target._id).lean();
    expect(updated.institution).toBe('');
    expect(updated.preferences.prefilterDepartment).toBe(false);
  });

  it('clears prefilterGroup when an admin clears a user\'s group', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const target = await makeUser({ group: 'Military transitions', preferences: { prefilterGroup: true } });

    const res = await runPatch(
      { userId: target._id.toString(), group: '' },
      { role: 'admin', userId: admin._id.toString() }
    );

    expect(res.statusCode).toBe(200);
    const updated = await User.findById(target._id).lean();
    expect(updated.preferences.prefilterGroup).toBe(false);
  });

  it('leaves prefilterDepartment alone when institution is changed to a real value, not cleared', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const target = await makeUser({ institution: 'IRCC', preferences: { prefilterDepartment: true } });

    const res = await runPatch(
      { userId: target._id.toString(), institution: 'EDSC-ESDC' },
      { role: 'admin', userId: admin._id.toString() }
    );

    expect(res.statusCode).toBe(200);
    const updated = await User.findById(target._id).lean();
    expect(updated.preferences.prefilterDepartment).toBe(true);
  });
});
