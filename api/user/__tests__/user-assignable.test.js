import { describe, it, expect } from 'vitest';
import handler from '../user-assignable.js';
import dbConnect from '../../db/db-connect.js';
import { User } from '../../../models/user.js';

function createReq(user) {
  return {
    method: 'GET',
    path: '/api/user/user-assignable',
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

async function runGet(user) {
  const res = createRes();
  await handler(createReq(user), res);
  return res;
}

async function makeUser(overrides = {}) {
  return User.create({ email: `assignable-${Date.now()}-${Math.random()}@example.com`, password: 'password123', role: 'partner', active: true, ...overrides });
}

describe('user-assignable', () => {
  it('returns no_institution with just the requester for a partner with neither institution nor group set', async () => {
    await dbConnect();
    const partner = await makeUser();

    const res = await runGet({ role: 'partner', userId: partner._id.toString() });

    expect(res.statusCode).toBe(200);
    // Self-assign is always allowed (see chat-assign.js), so the picker
    // isn't empty even with nothing to match institution/group-mates on.
    expect(res.payload.users.map(u => u.id)).toEqual([partner._id.toString()]);
    expect(res.payload.reason).toBe('no_institution');
  });

  it('returns only the partner themselves when no one else shares their institution/group', async () => {
    await dbConnect();
    const partner = await makeUser({ institution: 'IRCC-solo' });

    const res = await runGet({ role: 'partner', userId: partner._id.toString() });

    expect(res.statusCode).toBe(200);
    expect(res.payload.users.map(u => u.id)).toEqual([partner._id.toString()]);
    expect(res.payload.reason).toBeUndefined();
  });

  it('includes institution-mates and group-mates, but not unrelated users', async () => {
    await dbConnect();
    const partner = await makeUser({ institution: 'ESDC-shared', group: 'Intake' });
    const institutionMate = await makeUser({ institution: 'ESDC-shared' });
    const groupMate = await makeUser({ institution: 'Other-dept', group: 'Intake' });
    const stranger = await makeUser({ institution: 'Other-dept', group: 'Other-team' });

    const res = await runGet({ role: 'partner', userId: partner._id.toString() });

    const ids = res.payload.users.map(u => u.id);
    expect(ids).toEqual(expect.arrayContaining([partner._id.toString(), institutionMate._id.toString(), groupMate._id.toString()]));
    expect(ids).not.toContain(stranger._id.toString());
  });

  it('excludes inactive users from the list', async () => {
    await dbConnect();
    const partner = await makeUser({ institution: 'IRCC-inactive-test' });
    const inactiveMate = await makeUser({ institution: 'IRCC-inactive-test', active: false });

    const res = await runGet({ role: 'partner', userId: partner._id.toString() });

    const ids = res.payload.users.map(u => u.id);
    expect(ids).not.toContain(inactiveMate._id.toString());
  });

  it('returns every active partner/admin for an admin, regardless of institution/group', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin' });
    const somePartner = await makeUser({ institution: 'Unrelated-dept' });

    const res = await runGet({ role: 'admin', userId: admin._id.toString() });

    const ids = res.payload.users.map(u => u.id);
    expect(ids).toContain(somePartner._id.toString());
    expect(res.payload.reason).toBeUndefined();
  });
});
