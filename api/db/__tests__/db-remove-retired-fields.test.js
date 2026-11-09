import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { RETIRED_FIELDS } from '../db-remove-retired-fields.js';
import dbConnect from '../db-connect.js';
import { User } from '../../../models/user.js';
import SettingsAuditService from '../../../services/SettingsAuditService.js';

const CONFIRMED = RETIRED_FIELDS.map(({ model, field }) => `${model.collection.collectionName}.${field}`);

function createReq(method, role = 'admin', body = { fields: CONFIRMED }) {
  return {
    method,
    path: '/api/db/db-remove-retired-fields',
    body,
    user: { role, userId: 'admin-test', email: 'admin@example.com' },
    isAuthenticated: () => true,
  };
}

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    setHeader: () => {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function run(method, role, body) {
  const res = createRes();
  await handler(createReq(method, role, body), res);
  return res;
}

const countFor = (fields, field) => fields.find((f) => f.field === field)?.count;
const removedFor = (fields, field) => fields.find((f) => f.field === field)?.removed;

describe('db-remove-retired-fields', () => {
  beforeEach(async () => {
    await dbConnect();
    await User.collection.deleteMany({});
    // Written past Mongoose so the retired fields really are stored.
    await User.collection.insertMany([
      { email: 'old@example.com', password: 'x', resetPasswordSecret: 'S3CRET', resetPasswordAttempts: 2, twoFASecret: 'LEGACY' },
      { email: 'new@example.com', password: 'y' },
    ]);
  });

  it('lists only fields that are no longer in their schema', () => {
    for (const { model, field } of RETIRED_FIELDS) {
      expect(model.schema.path(field), `${field} is still in the ${model.modelName} schema`).toBeUndefined();
    }
  });

  it('GET reports counts and changes nothing', async () => {
    const res = await run('GET');
    expect(res.statusCode).toBe(200);
    expect(countFor(res.payload.fields, 'resetPasswordSecret')).toBe(1);
    expect(countFor(res.payload.fields, 'resetPasswordAttempts')).toBe(1);
    expect(countFor(res.payload.fields, 'resetPasswordLockedUntil')).toBe(0);
    const old = await User.collection.findOne({ email: 'old@example.com' });
    expect(old.resetPasswordSecret).toBe('S3CRET');
  });

  it('POST removes the listed fields, leaves other fields alone, and logs who ran it', async () => {
    const audit = vi.spyOn(SettingsAuditService, 'recordAction');
    const res = await run('POST');
    expect(res.statusCode).toBe(200);
    expect(removedFor(res.payload.fields, 'resetPasswordSecret')).toBe(1);
    expect(removedFor(res.payload.fields, 'resetPasswordAttempts')).toBe(1);
    expect(removedFor(res.payload.fields, 'twoFASecret')).toBe(1);

    const users = await User.collection.find({}).sort({ email: 1 }).toArray();
    expect(users.map((u) => u.email)).toEqual(['new@example.com', 'old@example.com']);
    for (const user of users) {
      expect(user).not.toHaveProperty('resetPasswordSecret');
      expect(user).not.toHaveProperty('resetPasswordAttempts');
      expect(user).not.toHaveProperty('twoFASecret');
      expect(user.password).toBeTruthy();
    }

    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      actorEmail: 'admin@example.com',
      action: 'database.retired_fields_removed',
      metadata: { removed: expect.stringContaining('users.resetPasswordSecret: 1') },
    }));
    audit.mockRestore();
  });

  it.each([
    ['a field not on the list', [...CONFIRMED, 'users.email']],
    ['a missing field', CONFIRMED.slice(1)],
    ['no list', undefined],
  ])('POST refuses a confirmed list with %s and changes nothing', async (_label, fields) => {
    const res = await run('POST', 'admin', { fields });
    expect(res.statusCode).toBe(409);
    const old = await User.collection.findOne({ email: 'old@example.com' });
    expect(old.resetPasswordSecret).toBe('S3CRET');
    expect(old.email).toBe('old@example.com');
  });

  it('logs the run even when the removal fails', async () => {
    const audit = vi.spyOn(SettingsAuditService, 'recordAction');
    const update = vi.spyOn(User.collection, 'updateMany').mockRejectedValueOnce(new Error('failover'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await run('POST');
    expect(res.statusCode).toBe(500);
    expect(res.payload).not.toHaveProperty('error');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      actorEmail: 'admin@example.com',
      action: 'database.retired_fields_removal_failed',
    }));
    update.mockRestore();
    audit.mockRestore();
    log.mockRestore();
  });

  it('logs what a failed removal had already changed', async () => {
    const audit = vi.spyOn(SettingsAuditService, 'recordAction');
    const realUpdate = User.collection.updateMany.bind(User.collection);
    // Partly applied, then fails: one field is gone, the others are not.
    const update = vi.spyOn(User.collection, 'updateMany').mockImplementationOnce(async () => {
      await realUpdate({ resetPasswordSecret: { $exists: true } }, { $unset: { resetPasswordSecret: '' } });
      throw new Error('failover');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await run('POST');
    expect(res.statusCode).toBe(500);
    const { metadata } = audit.mock.calls[0][0];
    expect(metadata.removed).toContain('users.resetPasswordSecret: 1');
    expect(metadata.removed).toContain('users.resetPasswordAttempts: 0');
    expect(metadata.removed).toContain('users.twoFASecret: 0');
    update.mockRestore();
    audit.mockRestore();
    log.mockRestore();
  });

  it('logs "unknown" when the recount after a failure also fails', async () => {
    const audit = vi.spyOn(SettingsAuditService, 'recordAction');
    const update = vi.spyOn(User.collection, 'updateMany').mockRejectedValueOnce(new Error('failover'));
    const realCount = User.collection.countDocuments.bind(User.collection);
    let calls = 0;
    // The counts before the write succeed; the recount after it fails.
    const count = vi.spyOn(User.collection, 'countDocuments').mockImplementation((...args) => {
      calls += 1;
      return calls <= RETIRED_FIELDS.length ? realCount(...args) : Promise.reject(new Error('still down'));
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await run('POST');
    expect(audit.mock.calls[0][0].metadata.removed).toContain('users.resetPasswordSecret: unknown');
    count.mockRestore();
    update.mockRestore();
    audit.mockRestore();
    log.mockRestore();
  });

  it('a second run finds nothing', async () => {
    await run('POST');
    const counts = await run('GET');
    expect(counts.payload.fields.every((f) => f.count === 0)).toBe(true);
    const again = await run('POST');
    expect(again.payload.fields.every((f) => f.removed === 0)).toBe(true);
  });

  it('refuses a partner', async () => {
    const res = await run('POST', 'partner');
    expect(res.statusCode).toBe(403);
    const old = await User.collection.findOne({ email: 'old@example.com' });
    expect(old.resetPasswordSecret).toBe('S3CRET');
  });
});
