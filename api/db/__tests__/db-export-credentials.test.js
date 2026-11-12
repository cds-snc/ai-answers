import { describe, it, expect } from 'vitest';
import handler from '../db-database-management.js';
import chatLogsHandler from '../db-chat-logs.js';
import dbConnect from '../db-connect.js';
import { User } from '../../../models/user.js';
import { TrustedDevice } from '../../../models/trustedDevice.js';
import { Chat } from '../../../models/chat.js';
import { Interaction } from '../../../models/interaction.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';
import { AuditLog } from '../../../models/auditLog.js';

// Database exports are files that leave the server. Sign-in secrets
// (password hash, reset token hash, 2FA code hash, trusted-device token hash)
// are select: false in their schemas, so the export's plain find() leaves them
// out. These tests run against the real in-memory database: a mocked model
// would not apply select: false.
const USER_SECRETS = ['password', 'resetPasswordTokenHash', 'twoFACode'];
const ADMIN = { role: 'admin', userId: 'admin-test', email: 'admin@canada.ca' };

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

async function call(method, { query = {}, body } = {}) {
  const res = createRes();
  await handler({ method, query, body, path: '/api/db-database-management', user: ADMIN, isAuthenticated: () => true }, res);
  // Serialize like Express would.
  return { ...res, payload: JSON.parse(JSON.stringify(res.payload)) };
}

async function makeUserWithSecrets(email = 'reviewer@canada.ca') {
  const user = await User.create({ email, password: 'original-password' });
  await User.updateOne({ _id: user._id }, {
    $set: { resetPasswordTokenHash: 'reset-token-hash', twoFACode: 'twofa-code-hash' }
  });
  return user;
}

// A chat with expert feedback, owned by `user`, so the user is in the
// "Expert evaluation chats" export.
async function makeExpertEvaluatedChat(user) {
  const feedback = await ExpertFeedback.create({ totalScore: 80, type: 'expert' });
  const interaction = await Interaction.create({ expertFeedback: feedback._id });
  await Chat.create({ chatId: 'evaluated-chat', user: user._id, interactions: [interaction._id] });
}

function expectNoSecrets(docs, secrets) {
  expect(docs.length).toBeGreaterThan(0);
  for (const doc of docs) {
    for (const field of secrets) expect(doc).not.toHaveProperty(field);
  }
}

describe('database export leaves out sign-in secrets', () => {
  it('a users export has no password, reset token hash or 2FA code', async () => {
    await dbConnect();
    await makeUserWithSecrets();

    const res = await call('GET', { query: { collection: 'user' } });

    expect(res.statusCode).toBe(200);
    expectNoSecrets(res.payload.data, USER_SECRETS);
    expect(res.payload.data[0].email).toBe('reviewer@canada.ca');
  });

  it('the "Expert evaluation chats" export has no user secrets', async () => {
    await dbConnect();
    const user = await makeUserWithSecrets();
    await makeExpertEvaluatedChat(user);

    const res = await call('GET', { query: { collection: 'user', exportScope: 'expertEvalChats' } });

    expect(res.statusCode).toBe(200);
    expect(res.payload.data.map(d => d.email)).toEqual(['reviewer@canada.ca']);
    expectNoSecrets(res.payload.data, USER_SECRETS);
  });

  it('trusted devices are not exported at all', async () => {
    // Without the token hash (select: false) the rows are useless, and the
    // unique index on it would reject them on import.
    await dbConnect();
    const user = await makeUserWithSecrets();
    await TrustedDevice.create({ tokenHash: 'device-token-hash', userId: user._id, expiresAt: new Date(Date.now() + 60000) });

    // "All" lists the collections, then exports each one with this same request.
    const list = await call('GET', { query: { collection: 'All' } });
    expect(list.payload.collections).toContain('user');
    expect(list.payload.collections).not.toContain('trusteddevice');

    const res = await call('GET', { query: { collection: 'trusteddevice' } });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.payload)).not.toContain('device-token-hash');
  });

  it('a trusted device query leaves out the token hash', async () => {
    await dbConnect();
    const user = await makeUserWithSecrets();
    await TrustedDevice.create({ tokenHash: 'device-token-hash', userId: user._id, expiresAt: new Date(Date.now() + 60000) });
    const [row] = await TrustedDevice.find({}).lean();
    expect(row).not.toHaveProperty('tokenHash');
  });

  it('the secrets are still stored, for the code that asks for them', async () => {
    await dbConnect();
    const user = await makeUserWithSecrets();
    const stored = await User.findById(user._id).select('+password +resetPasswordTokenHash +twoFACode').lean();
    expect(stored.password).toMatch(/^\$2[aby]\$10\$/);
    expect(stored.resetPasswordTokenHash).toBe('reset-token-hash');
    expect(stored.twoFACode).toBe('twofa-code-hash');
  });
});

describe('database export audit', () => {
  it('writes one audit entry per collection, on the first page only', async () => {
    await dbConnect();
    await makeUserWithSecrets('a@canada.ca');
    await makeUserWithSecrets('b@canada.ca');

    const first = await call('GET', { query: { collection: 'user', limit: 1, startDate: '2026-01-01' } });
    await call('GET', { query: { collection: 'user', limit: 1, lastId: first.payload.lastId } });

    const entries = await AuditLog.find({ action: 'database.exported' }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: 'admin-test',
      actorEmail: 'admin@canada.ca',
      source: 'admin',
      metadata: { collection: 'user', scope: 'all', startDate: '2026-01-01', endDate: null },
    });
  });

  it('records the expert evaluation scope', async () => {
    await dbConnect();
    const user = await makeUserWithSecrets();
    await makeExpertEvaluatedChat(user);

    await call('GET', { query: { collection: 'chat', exportScope: 'expertEvalChats' } });

    const entry = await AuditLog.findOne({ action: 'database.exported' }).lean();
    expect(entry.metadata).toMatchObject({ collection: 'chat', scope: 'expertEvalChats' });
  });
});

describe('filtered chat logs', () => {
  // A filter sends db-chat-logs down its aggregation path, which joins in the
  // user with $lookup. $lookup ignores select: false, so the handler strips the
  // secrets itself. Any signed-in user, partners included, can call this.
  // Any filter takes the aggregation path; "not evaluated" matches a bare interaction.
  async function unevaluatedChat(chatId, user) {
    const interaction = await Interaction.create({});
    await Chat.create({ chatId, ...(user ? { user: user._id } : {}), interactions: [interaction._id] });
  }

  async function getLogs(query) {
    const res = createRes();
    await chatLogsHandler({
      method: 'GET', query, path: '/api/db/db-chat-logs',
      user: { role: 'partner', userId: 'partner-test' }, isAuthenticated: () => true
    }, res);
    return { ...res, payload: JSON.parse(JSON.stringify(res.payload)) };
  }

  it('returns the chat owner without credential hashes', async () => {
    await dbConnect();
    const user = await makeUserWithSecrets();
    await unevaluatedChat('owned-chat', user);

    const res = await getLogs({ partnerEval: 'noEval' });

    expect(res.statusCode).toBe(200);
    expect(res.payload.logs).toHaveLength(1);
    expect(res.payload.logs[0].user.email).toBe('reviewer@canada.ca');
    expectNoSecrets(res.payload.logs.map(chat => chat.user), USER_SECRETS);
  });

  it('still tells public chats apart from signed-in ones', async () => {
    // The public filter checks that `user` is missing after the join; the
    // stripping stage must not create an empty user object.
    await dbConnect();
    const user = await makeUserWithSecrets();
    await unevaluatedChat('owned-chat', user);
    await unevaluatedChat('public-chat', null);

    const res = await getLogs({ partnerEval: 'noEval', userType: 'public' });

    expect(res.payload.logs.map(chat => chat.chatId)).toEqual(['public-chat']);
    expect(res.payload.logs[0]).not.toHaveProperty('user');
  });
});

describe('database import of users exported without passwords', () => {
  it('keeps the password of a user who already exists', async () => {
    await dbConnect();
    await makeUserWithSecrets();
    const exported = await call('GET', { query: { collection: 'user' } });
    const line = JSON.stringify({ collection: 'user', doc: { ...exported.payload.data[0], institution: 'IRCC' } });

    const res = await call('POST', {
      body: { chunkIndex: 0, totalChunks: 1, fileName: 'export.jsonl', chunkPayload: line, collection: 'All' }
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload.stats.failed).toBe(0);
    const user = await User.findOne({ email: 'reviewer@canada.ca' }).select('+password');
    expect(user.institution).toBe('IRCC');
    expect(await user.comparePassword('original-password')).toBe(true);
  });
});

describe('database import of trusted devices', () => {
  it('skips rows from older export files that still have them', async () => {
    await dbConnect();
    const user = await makeUserWithSecrets();
    const lines = ['a', 'b'].map(id => JSON.stringify({
      collection: 'trusteddevice',
      doc: { userId: user._id, expiresAt: new Date().toISOString(), tokenHash: `hash-${id}` }
    })).join('\n');

    const res = await call('POST', {
      body: { chunkIndex: 0, totalChunks: 1, fileName: 'old-export.jsonl', chunkPayload: lines, collection: 'All' }
    });

    expect(res.payload.stats).toMatchObject({ inserted: 0, failed: 0, skipped: 2 });
    expect(await TrustedDevice.countDocuments()).toBe(0);
  });
});
