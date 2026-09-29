import { describe, it, expect, afterEach } from 'vitest';
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
  // QA-group users show up in every partner's list, so clear them out or
  // they'd leak into the other tests' exact-match expectations.
  afterEach(async () => {
    await User.deleteMany({ group: 'AI Answers QA' });
  });

  it('returns no_institution with just the requester for a partner with neither institution nor group set', async () => {
    await dbConnect();
    const partner = await makeUser();

    const res = await runGet({ role: 'partner', userId: partner._id.toString() });

    expect(res.statusCode).toBe(200);
    // Self-assign is always allowed (see chat-assign-interaction.js), so the picker
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

  it('orders the list you, then group-mates, then institution-mates, each alphabetical, and tags each with its relation', async () => {
    await dbConnect();
    const tag = `${Date.now()}-${Math.random()}`;
    const partner = await makeUser({ email: `mm-me-${tag}@example.com`, institution: `ESDC-order-${tag}`, group: `Intake-order-${tag}` });
    // Alphabetically last, but a group-mate, so it comes before the institution-mate.
    const groupMate = await makeUser({ email: `zz-groupmate-${tag}@example.com`, institution: `Other-order-${tag}`, group: `Intake-order-${tag}` });
    const institutionMateB = await makeUser({ email: `bb-instmate-${tag}@example.com`, institution: `ESDC-order-${tag}` });
    const institutionMateA = await makeUser({ email: `aa-instmate-${tag}@example.com`, institution: `ESDC-order-${tag}` });

    const res = await runGet({ role: 'partner', userId: partner._id.toString() });

    expect(res.payload.users.map(u => u.id)).toEqual([
      partner._id.toString(), groupMate._id.toString(), institutionMateA._id.toString(), institutionMateB._id.toString()
    ]);
    expect(res.payload.users.map(u => u.relation)).toEqual(['self', 'group', 'institution', 'institution']);
  });

  it('puts QA-group members after institution-mates, tagged qa, for any partner', async () => {
    await dbConnect();
    const tag = `${Date.now()}-${Math.random()}`;
    const partner = await makeUser({ email: `mm-me-${tag}@example.com`, institution: `ESDC-qa-${tag}` });
    const institutionMate = await makeUser({ email: `zz-instmate-${tag}@example.com`, institution: `ESDC-qa-${tag}` });
    // Alphabetically first and in an unrelated institution, but still listed - after the institution-mate.
    const qaMember = await makeUser({ email: `aa-qa-${tag}@example.com`, institution: `Other-qa-${tag}`, group: 'AI Answers QA' });

    const res = await runGet({ role: 'partner', userId: partner._id.toString() });

    expect(res.payload.users.map(u => u.id)).toEqual([
      partner._id.toString(), institutionMate._id.toString(), qaMember._id.toString()
    ]);
    expect(res.payload.users.map(u => u.relation)).toEqual(['self', 'institution', 'qa']);
  });

  it('lists QA-group members even for a partner with no institution or group', async () => {
    await dbConnect();
    const partner = await makeUser();
    const qaMember = await makeUser({ group: 'AI Answers QA' });

    const res = await runGet({ role: 'partner', userId: partner._id.toString() });

    expect(res.payload.users.map(u => u.id)).toEqual([partner._id.toString(), qaMember._id.toString()]);
    expect(res.payload.reason).toBe('no_institution');
  });

  it('for an admin, own institution-mates come before everyone else', async () => {
    await dbConnect();
    const tag = `${Date.now()}-${Math.random()}`;
    const admin = await makeUser({ role: 'admin', institution: `Admin-inst-${tag}` });
    const mate = await makeUser({ institution: `Admin-inst-${tag}` });
    const stranger = await makeUser({ institution: `Unrelated-${tag}` });

    const res = await runGet({ role: 'admin', userId: admin._id.toString() });

    const ids = res.payload.users.map(u => u.id);
    expect(ids[0]).toBe(admin._id.toString());
    expect(ids.indexOf(mate._id.toString())).toBeLessThan(ids.indexOf(stranger._id.toString()));
    const byId = Object.fromEntries(res.payload.users.map(u => [u.id, u.relation]));
    expect(byId[mate._id.toString()]).toBe('institution');
    expect(byId[stranger._id.toString()]).toBe('other');
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
