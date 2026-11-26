import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import handler from '../db-chat-logs.js';
import dbConnect from '../db-connect.js';
import { Chat } from '../../../models/chat.js';
import { Interaction } from '../../../models/interaction.js';
import { BatchItem } from '../../../models/batchItem.js';
import { Batch } from '../../../models/batch.js';
import { User } from '../../../models/user.js';
import { PublicFeedback } from '../../../models/publicFeedback.js';

// db-chat-logs serves the Batches page's CSV/Excel export only
// (BatchService.retrieveBatchChats). Real in-memory database.

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

const PARTNER = { role: 'partner', userId: 'partner-test' };

async function getLogs(query, user = PARTNER) {
  const res = createRes();
  await handler({
    method: 'GET', query, path: '/api/db/db-chat-logs',
    user, isAuthenticated: () => true
  }, res);
  // Serialize like Express would.
  return { ...res, payload: JSON.parse(JSON.stringify(res.payload)) };
}

// A batch the test partner created, so it passes the AIA-001 access check.
async function ownBatch(createdBy = PARTNER.userId) {
  const batch = await Batch.create({ name: 'b', type: 'question', aiProvider: 'openai', pageLanguage: 'en', createdBy });
  return batch._id;
}

async function chatInBatch(batchId, chatId, { user, daysAgo = 0 } = {}) {
  const interaction = await Interaction.create({});
  const chat = await Chat.create({ chatId, ...(user ? { user: user._id } : {}), interactions: [interaction._id] });
  if (daysAgo) {
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    await Chat.collection.updateOne({ _id: chat._id }, { $set: { createdAt } });
  }
  if (batchId) await BatchItem.create({ batch: batchId, chat: chat._id });
  return chat;
}

describe('db-chat-logs (batch export)', () => {
  it('returns the chats of a batch that ran weeks ago', async () => {
    // It used to search only the last 7 days, so older batches exported nothing.
    await dbConnect();
    const batchId = await ownBatch();
    await chatInBatch(batchId, 'old-batch-chat', { daysAgo: 30 });

    const res = await getLogs({ batchId: batchId.toString(), limit: '1000' });

    expect(res.statusCode).toBe(200);
    expect(res.payload.logs.map(chat => chat.chatId)).toEqual(['old-batch-chat']);
  });

  it('returns feedback that is only on the recovery pointer', async () => {
    await dbConnect();
    const batchId = await ownBatch();
    const chat = await chatInBatch(batchId, 'recovered-feedback');
    const doc = await PublicFeedback.create({
      feedback: 'yes',
      publicFeedbackReason: 'Saved me time',
      publicFeedbackScore: 3,
    });
    await Interaction.updateOne(
      { _id: chat.interactions[0] },
      { $set: { publicFeedbackRecover: doc._id } }
    );

    const res = await getLogs({ batchId: batchId.toString() });

    const returned = res.payload.logs[0].interactions[0];
    expect(returned.publicFeedback.feedback).toBe('yes');
    expect(returned.publicFeedback.publicFeedbackScore).toBe(3);
    expect(returned.publicFeedbackRecover).toBeUndefined();
  });

  it('returns only the chats of that batch', async () => {
    await dbConnect();
    const batchId = await ownBatch();
    await chatInBatch(batchId, 'in-batch');
    await chatInBatch(new mongoose.Types.ObjectId(), 'other-batch');
    await chatInBatch(null, 'no-batch');

    const res = await getLogs({ batchId: batchId.toString() });

    expect(res.payload.logs.map(chat => chat.chatId)).toEqual(['in-batch']);
  });

  it('gives the chat owner as email only', async () => {
    await dbConnect();
    const user = await User.create({ email: 'reviewer@canada.ca', password: 'original-password', institution: 'IRCC' });
    await User.updateOne({ _id: user._id }, { $set: { twoFACode: 'twofa-code-hash', resetPasswordTokenHash: 'reset-hash' } });
    const batchId = await ownBatch();
    await chatInBatch(batchId, 'owned-chat', { user });

    const res = await getLogs({ batchId: batchId.toString() });

    expect(Object.keys(res.payload.logs[0].user).sort()).toEqual(['_id', 'email']);
    expect(res.payload.logs[0].user.email).toBe('reviewer@canada.ca');
  });

  it('applies the limit', async () => {
    await dbConnect();
    const batchId = await ownBatch();
    await chatInBatch(batchId, 'first');
    await chatInBatch(batchId, 'second');

    const res = await getLogs({ batchId: batchId.toString(), limit: '1' });

    expect(res.payload.logs.map(chat => chat.chatId)).toEqual(['first']);
  });

  it("refuses another partner's batch with a 404", async () => {
    await dbConnect();
    const batchId = await ownBatch('someone-else');
    await chatInBatch(batchId, 'not-mine');

    const res = await getLogs({ batchId: batchId.toString() });

    expect(res.statusCode).toBe(404);
    expect(res.payload).toEqual({ error: 'Batch not found' });
  });

  it("lets an admin export anyone's batch", async () => {
    await dbConnect();
    const batchId = await ownBatch('someone-else');
    await chatInBatch(batchId, 'partner-chat');

    const res = await getLogs({ batchId: batchId.toString() }, { role: 'admin', userId: 'admin-test' });

    expect(res.statusCode).toBe(200);
    expect(res.payload.logs.map(chat => chat.chatId)).toEqual(['partner-chat']);
  });

  it('refuses a signed-in user who is neither partner nor admin', async () => {
    await dbConnect();
    const batchId = await ownBatch('viewer-test');

    const res = await getLogs({ batchId: batchId.toString() }, { role: 'viewer', userId: 'viewer-test' });

    expect(res.statusCode).toBe(403);
  });

  it.each([
    [{}],
    [{ batchId: 'not-an-id' }],
    [{ batchId: { $ne: null } }],
  ])('fails a missing or invalid batchId with the catch-all 500: %o', async (query) => {
    const res = await getLogs(query);
    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ error: 'Failed to fetch logs' });
  });

  it.each([
    [{ batchId: '64fec1000000000000000001', limit: 'abc' }, 'limit must be a whole number from 1 to 1000'],
    [{ batchId: '64fec1000000000000000001', limit: '0' }, 'limit must be a whole number from 1 to 1000'],
    [{ batchId: '64fec1000000000000000001', limit: '1001' }, 'limit must be a whole number from 1 to 1000'],
    // Dashboard filters and paging are not served here; refused, not ignored.
    [{ batchId: '64fec1000000000000000001', department: 'IRCC' }, 'Unsupported parameter: department'],
    [{ batchId: '64fec1000000000000000001', startDate: '2026-01-01', lastId: 'x' }, 'Unsupported parameter: startDate, lastId'],
    [{ group: 'Military transitions' }, 'Unsupported parameter: group'],
  ])('refuses %o', async (query, error) => {
    const res = await getLogs(query);
    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error });
  });
});
