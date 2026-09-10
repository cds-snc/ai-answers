import { describe, it, expect } from 'vitest';
import handler from '../user-me.js';
import dbConnect from '../../db/db-connect.js';
import { User } from '../../../models/user.js';

function createReq({ method, body, user }) {
  return {
    method,
    body,
    path: '/api/user/user-me',
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

async function run(method, body, user) {
  const res = createRes();
  await handler(createReq({ method, body, user }), res);
  return res;
}

async function makeUser(overrides = {}) {
  return User.create({ email: `me-${Date.now()}-${Math.random()}@example.com`, password: 'password123', role: 'partner', active: true, ...overrides });
}

describe('user-me PATCH institution/group lock', () => {
  it('lets a partner set their institution the first time', async () => {
    await dbConnect();
    const partner = await makeUser();

    const res = await run('PATCH', { institution: 'IRCC' }, { role: 'partner', userId: partner._id.toString() });

    expect(res.statusCode).toBe(200);
    expect(res.payload.institution).toBe('IRCC');
  });

  it('blocks a partner from changing an already-set institution', async () => {
    await dbConnect();
    const partner = await makeUser({ institution: 'IRCC' });

    const res = await run('PATCH', { institution: 'EDSC-ESDC' }, { role: 'partner', userId: partner._id.toString() });

    expect(res.statusCode).toBe(403);
    expect(res.payload.code).toBe('institution_locked');
    const unchanged = await User.findById(partner._id).lean();
    expect(unchanged.institution).toBe('IRCC');
  });

  it('blocks a partner from clearing an already-set group', async () => {
    await dbConnect();
    // Only one curated group exists (src/constants/partnerGroups.js), so this
    // covers the lock via unassignment rather than switching to a second
    // real group value - normalizeGroup('') is still a valid value, and the
    // lock has to catch that change too, not just a change to another group.
    const partner = await makeUser({ group: 'Military transitions' });

    const res = await run('PATCH', { group: '' }, { role: 'partner', userId: partner._id.toString() });

    expect(res.statusCode).toBe(403);
    expect(res.payload.code).toBe('group_locked');
  });

  it('allows re-saving the same institution value (no actual change)', async () => {
    await dbConnect();
    const partner = await makeUser({ institution: 'IRCC' });

    const res = await run('PATCH', { institution: 'IRCC' }, { role: 'partner', userId: partner._id.toString() });

    expect(res.statusCode).toBe(200);
  });

  it('lets an admin change their own institution freely', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin', institution: 'IRCC' });

    const res = await run('PATCH', { institution: 'EDSC-ESDC' }, { role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(200);
    expect(res.payload.institution).toBe('EDSC-ESDC');
  });
});

describe('user-me PATCH clears stale prefilter preferences', () => {
  it('clears prefilterDepartment when an admin clears their own institution', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin', institution: 'IRCC', preferences: { prefilterDepartment: true } });

    const res = await run('PATCH', { institution: '' }, { role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(200);
    expect(res.payload.institution).toBe('');
    expect(res.payload.preferences.prefilterDepartment).toBe(false);
  });

  it('clears prefilterGroup when an admin clears their own group', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin', group: 'Military transitions', preferences: { prefilterGroup: true } });

    const res = await run('PATCH', { group: '' }, { role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(200);
    expect(res.payload.preferences.prefilterGroup).toBe(false);
  });

  it('leaves prefilterDepartment alone when institution is set to a real value, not cleared', async () => {
    await dbConnect();
    const admin = await makeUser({ role: 'admin', institution: 'IRCC', preferences: { prefilterDepartment: true } });

    const res = await run('PATCH', { institution: 'EDSC-ESDC' }, { role: 'admin', userId: admin._id.toString() });

    expect(res.statusCode).toBe(200);
    expect(res.payload.preferences.prefilterDepartment).toBe(true);
  });
});
