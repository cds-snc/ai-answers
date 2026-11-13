import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import dbConnect from '../../db/db-connect.js';
import { Batch } from '../../../models/batch.js';
import { BatchItem } from '../../../models/batchItem.js';
import { User } from '../../../models/user.js';
import {
  canAccessBatch,
  parseBatchScope,
  batchListFilter,
} from '../../util/batch-access.js';
import retrieveHandler from '../batch-retrieve.js';
import statsHandler from '../batch-stats.js';
import deleteHandler from '../batch-delete.js';
import itemsUpsertHandler from '../batch-items-upsert.js';
import persistHandler from '../batch-persist.js';
import listHandler from '../batch-list.js';
import listFiltersHandler from '../batch-list-filters.js';
import deleteAllHandler from '../batches-delete-all.js';
import chatLogsHandler from '../../db/db-chat-logs.js';
import chatExportLogsHandler from '../../chat/chat-export-logs.js';
import { Chat } from '../../../models/chat.js';

// Security finding AIA-001: the batch endpoints must check who owns a batch.

const INSTITUTION = 'DND-MDN';
const GROUP = 'Military transitions';

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    setHeader: () => {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function call(handler, { method = 'GET', query = {}, body, user }) {
  const res = createRes();
  await handler({ method, query, body, user, path: '/api/batch/test', isAuthenticated: () => true }, res);
  return res;
}

const asReqUser = (doc, role = doc.role) => ({ userId: String(doc._id), role });

let created = { users: [], batches: [], chats: [] };

async function makeUser(overrides = {}) {
  const user = await User.create({
    email: `batch-${Date.now()}-${Math.random()}@example.com`,
    password: 'password123',
    role: 'partner',
    active: true,
    ...overrides,
  });
  created.users.push(user._id);
  return user;
}

async function makeBatch(owner, overrides = {}) {
  const batch = await Batch.create({
    type: 'csv',
    name: 'test batch',
    aiProvider: 'azure',
    pageLanguage: 'en',
    createdBy: owner ? String(owner._id) : '',
    ...overrides,
  });
  created.batches.push(batch._id);
  return batch;
}

beforeEach(async () => {
  await dbConnect();
});

afterEach(async () => {
  await BatchItem.deleteMany({ batch: { $in: created.batches } });
  await Batch.deleteMany({ _id: { $in: created.batches } });
  await User.deleteMany({ _id: { $in: created.users } });
  await Chat.deleteMany({ _id: { $in: created.chats } });
  created = { users: [], batches: [], chats: [] };
});

describe('batch-access rules', () => {
  it('lets only the creator or an admin access a batch, not institution- or group-mates', async () => {
    const owner = await makeUser({ institution: INSTITUTION, group: GROUP });
    const institutionMate = await makeUser({ institution: INSTITUTION });
    const groupMate = await makeUser({ institution: 'CEO-BEC', group: GROUP });
    const admin = await makeUser({ role: 'admin' });
    const batch = await makeBatch(owner);

    expect(canAccessBatch(asReqUser(owner), batch)).toBe(true);
    expect(canAccessBatch(asReqUser(admin), batch)).toBe(true);
    expect(canAccessBatch(asReqUser(institutionMate), batch)).toBe(false);
    expect(canAccessBatch(asReqUser(groupMate), batch)).toBe(false);
  });

  it('keeps legacy batches with no creator admin-only', async () => {
    const partner = await makeUser({ institution: INSTITUTION });
    const admin = await makeUser({ role: 'admin' });
    const legacy = await makeBatch(null);

    expect(canAccessBatch(asReqUser(partner), legacy)).toBe(false);
    expect(canAccessBatch(asReqUser(admin), legacy)).toBe(true);
  });

  it('falls back to "mine" for unknown scopes and rejects bad values', () => {
    expect(parseBatchScope(undefined)).toEqual({ kind: 'mine' });
    expect(parseBatchScope('everything')).toEqual({ kind: 'mine' });
    expect(parseBatchScope({ $ne: 1 })).toEqual({ kind: 'mine' });
    expect(parseBatchScope('all')).toEqual({ kind: 'all' });
    expect(parseBatchScope(`institution:${INSTITUTION}`)).toEqual({ kind: 'institution', value: INSTITUTION });
    expect(parseBatchScope('institution:NOPE')).toEqual({ kind: 'invalid' });
    expect(parseBatchScope('user:not-an-id')).toEqual({ kind: 'invalid' });
  });

  it('ignores scope for partners', async () => {
    const partner = await makeUser();
    const filter = await batchListFilter(asReqUser(partner), 'all');
    expect(filter).toEqual({ createdBy: String(partner._id) });
  });
});

describe('batch endpoints enforce ownership', () => {
  it('batch-retrieve and batch-stats: 404 for a group-mate or stranger, 200 for the creator', async () => {
    const owner = await makeUser({ institution: INSTITUTION, group: GROUP });
    const groupMate = await makeUser({ institution: 'CEO-BEC', group: GROUP });
    const stranger = await makeUser({ institution: 'CEO-BEC' });
    const batch = await makeBatch(owner);
    const query = { batchId: String(batch._id) };

    for (const user of [groupMate, stranger]) {
      expect((await call(retrieveHandler, { query, user: asReqUser(user) })).statusCode).toBe(404);
      expect((await call(statsHandler, { query, user: asReqUser(user) })).statusCode).toBe(404);
    }
    expect((await call(retrieveHandler, { query, user: asReqUser(owner) })).statusCode).toBe(200);
    expect((await call(statsHandler, { query, user: asReqUser(owner) })).statusCode).toBe(200);
  });

  it('batch-delete: strangers and group-mates are refused and the batch survives; the creator can delete', async () => {
    const owner = await makeUser({ institution: INSTITUTION, group: GROUP });
    const institutionMate = await makeUser({ institution: INSTITUTION });
    const groupMate = await makeUser({ institution: 'CEO-BEC', group: GROUP });
    const stranger = await makeUser({ institution: 'CEO-BEC' });
    const batch = await makeBatch(owner);
    const query = { batchId: String(batch._id) };

    for (const user of [institutionMate, groupMate, stranger]) {
      const denied = await call(deleteHandler, { method: 'DELETE', query, user: asReqUser(user) });
      expect(denied.statusCode).toBe(404);
    }
    expect(await Batch.exists({ _id: batch._id })).toBeTruthy();

    const allowed = await call(deleteHandler, { method: 'DELETE', query, user: asReqUser(owner) });
    expect(allowed.statusCode).toBe(200);
    expect(await Batch.exists({ _id: batch._id })).toBeFalsy();
  });

  it('batch-delete: an admin can delete anyone\'s batch', async () => {
    const owner = await makeUser({ institution: INSTITUTION });
    const admin = await makeUser({ role: 'admin' });
    const batch = await makeBatch(owner);

    const res = await call(deleteHandler, { method: 'DELETE', query: { batchId: String(batch._id) }, user: asReqUser(admin) });
    expect(res.statusCode).toBe(200);
    expect(await Batch.exists({ _id: batch._id })).toBeFalsy();
  });

  it('batch-items-upsert: only the creator or an admin can write items', async () => {
    const owner = await makeUser({ institution: INSTITUTION });
    const mate = await makeUser({ institution: INSTITUTION });
    const batch = await makeBatch(owner);
    const body = { batchId: String(batch._id), items: [{ rowIndex: 0, originalData: { q: 'x' } }] };

    const denied = await call(itemsUpsertHandler, { method: 'POST', body, user: asReqUser(mate) });
    expect(denied.statusCode).toBe(404);
    expect(await BatchItem.countDocuments({ batch: batch._id })).toBe(0);

    const allowed = await call(itemsUpsertHandler, { method: 'POST', body, user: asReqUser(owner) });
    expect(allowed.statusCode).toBe(200);
    expect(await BatchItem.countDocuments({ batch: batch._id })).toBe(1);
  });

  it('batch-persist update: a group-mate cannot change the batch', async () => {
    const owner = await makeUser({ institution: INSTITUTION });
    const mate = await makeUser({ institution: INSTITUTION });
    const batch = await makeBatch(owner, { status: 'uploaded' });

    const res = await call(persistHandler, {
      method: 'POST',
      body: { _id: String(batch._id), status: 'processed' },
      user: asReqUser(mate),
    });
    expect(res.statusCode).toBe(404);
    expect((await Batch.findById(batch._id).lean()).status).toBe('uploaded');
  });

  it('batch-persist update: an unknown id is not upserted into a new batch', async () => {
    const admin = await makeUser({ role: 'admin' });
    const unknownId = '64fec1000000000000000099';

    const res = await call(persistHandler, {
      method: 'POST',
      body: { _id: unknownId, status: 'processed' },
      user: asReqUser(admin),
    });
    expect(res.statusCode).toBe(404);
    expect(await Batch.exists({ _id: unknownId })).toBeFalsy();
  });

  it('batches-delete-all is admin-only', async () => {
    const partner = await makeUser({ institution: INSTITUTION });
    const batch = await makeBatch(partner);

    const res = await call(deleteAllHandler, { method: 'DELETE', user: asReqUser(partner) });
    expect(res.statusCode).toBe(403);
    expect(await Batch.exists({ _id: batch._id })).toBeTruthy();
  });
});

describe('batch-list', () => {
  const ids = (res) => res.payload.map((b) => String(b._id));

  it('shows a partner their own batches only, not institution or group batches', async () => {
    const partner = await makeUser({ institution: INSTITUTION, group: GROUP });
    const institutionMate = await makeUser({ institution: INSTITUTION });
    const groupMate = await makeUser({ institution: 'CEO-BEC', group: GROUP });
    const stranger = await makeUser({ institution: 'CEO-BEC' });
    const own = await makeBatch(partner);
    const inst = await makeBatch(institutionMate);
    const grp = await makeBatch(groupMate);
    const other = await makeBatch(stranger);
    const legacy = await makeBatch(null);

    const res = await call(listHandler, { query: { scope: 'all' }, user: asReqUser(partner) });
    expect(res.statusCode).toBe(200);
    expect(ids(res)).toEqual([String(own._id)]);
    expect(ids(res)).not.toContain(String(inst._id));
    expect(ids(res)).not.toContain(String(grp._id));
    expect(ids(res)).not.toContain(String(other._id));
    expect(ids(res)).not.toContain(String(legacy._id));
  });

  it('defaults an admin to their own batches and honours scope', async () => {
    const admin = await makeUser({ role: 'admin' });
    const partner = await makeUser({ institution: INSTITUTION });
    const mine = await makeBatch(admin);
    const theirs = await makeBatch(partner);

    const defaultRes = await call(listHandler, { user: asReqUser(admin) });
    expect(ids(defaultRes)).toContain(String(mine._id));
    expect(ids(defaultRes)).not.toContain(String(theirs._id));

    const instRes = await call(listHandler, { query: { scope: `institution:${INSTITUTION}` }, user: asReqUser(admin) });
    expect(ids(instRes)).toContain(String(theirs._id));
    expect(ids(instRes)).not.toContain(String(mine._id));

    const userRes = await call(listHandler, { query: { scope: `user:${partner._id}` }, user: asReqUser(admin) });
    expect(ids(userRes)).toEqual([String(theirs._id)]);

    const allRes = await call(listHandler, { query: { scope: 'all' }, user: asReqUser(admin) });
    expect(ids(allRes)).toEqual(expect.arrayContaining([String(mine._id), String(theirs._id)]));
  });
});

describe('batch-list-filters', () => {
  it('is admin-only', async () => {
    const partner = await makeUser();
    const res = await call(listFiltersHandler, { user: asReqUser(partner) });
    expect(res.statusCode).toBe(403);
  });

  it('lists only institutions, groups and users that have batches', async () => {
    const admin = await makeUser({ role: 'admin' });
    const withBatch = await makeUser({ institution: INSTITUTION, group: GROUP });
    const withoutBatch = await makeUser({ institution: 'CEO-BEC' });
    await makeBatch(withBatch);

    const res = await call(listFiltersHandler, { user: asReqUser(admin) });
    expect(res.statusCode).toBe(200);
    expect(res.payload.institutions).toContain(INSTITUTION);
    expect(res.payload.institutions).not.toContain('CEO-BEC');
    expect(res.payload.groups).toContain(GROUP);
    const userIds = res.payload.users.map((u) => u.id);
    expect(userIds).toContain(String(withBatch._id));
    expect(userIds).not.toContain(String(withoutBatch._id));
  });
});

describe('chat log exports filtered by batch', () => {
  async function batchWithChat(owner) {
    const batch = await makeBatch(owner);
    const chat = await Chat.create({ chatId: `batch-chat-${Date.now()}-${Math.random()}` });
    created.chats.push(chat._id);
    await BatchItem.create({ batch: batch._id, rowIndex: 0, chat: chat._id });
    return { batch, chat };
  }

  it('db-chat-logs: owner and admin get the chats; anyone else gets 404', async () => {
    const owner = await makeUser({ institution: INSTITUTION });
    const admin = await makeUser({ role: 'admin' });
    const stranger = await makeUser({ institution: INSTITUTION });
    const { batch, chat } = await batchWithChat(owner);
    const query = { batchId: String(batch._id), limit: '10' };

    for (const user of [owner, admin]) {
      const res = await call(chatLogsHandler, { query, user: asReqUser(user) });
      expect(res.statusCode).toBe(200);
      expect(res.payload.logs.map((c) => c.chatId)).toEqual([chat.chatId]);
    }

    const denied = await call(chatLogsHandler, { query, user: asReqUser(stranger) });
    expect(denied.statusCode).toBe(404);
    expect(denied.payload.logs).toBeUndefined();
  });

  it('chat-export-logs: owner and admin can export; anyone else gets 404', async () => {
    const owner = await makeUser({ institution: INSTITUTION });
    const admin = await makeUser({ role: 'admin' });
    const stranger = await makeUser({ institution: INSTITUTION });
    const { batch } = await batchWithChat(owner);
    const query = { batchId: String(batch._id), format: 'json' };

    for (const user of [owner, admin]) {
      const res = await call(chatExportLogsHandler, { query, user: asReqUser(user) });
      expect(res.statusCode).toBe(200);
    }

    const denied = await call(chatExportLogsHandler, { query, user: asReqUser(stranger) });
    expect(denied.statusCode).toBe(404);
  });
});
