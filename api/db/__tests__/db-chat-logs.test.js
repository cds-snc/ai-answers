import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import handler from '../db-chat-logs.js';
import dbConnect from '../db-connect.js';
import { Chat } from '../../../models/chat.js';
import { Interaction } from '../../../models/interaction.js';
import { BatchItem } from '../../../models/batchItem.js';
import { User } from '../../../models/user.js';

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

async function getLogs(query) {
  const res = createRes();
  await handler({
    method: 'GET', query, path: '/api/db/db-chat-logs',
    user: { role: 'partner', userId: 'partner-test' }, isAuthenticated: () => true
  }, res);
  // Serialize like Express would.
  return { ...res, payload: JSON.parse(JSON.stringify(res.payload)) };
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
    const batchId = new mongoose.Types.ObjectId();
    await chatInBatch(batchId, 'old-batch-chat', { daysAgo: 30 });

    const res = await getLogs({ batchId: batchId.toString(), limit: '1000' });

    expect(res.statusCode).toBe(200);
    expect(res.payload.logs.map(chat => chat.chatId)).toEqual(['old-batch-chat']);
  });

  it('returns only the chats of that batch', async () => {
    await dbConnect();
    const batchId = new mongoose.Types.ObjectId();
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
    const batchId = new mongoose.Types.ObjectId();
    await chatInBatch(batchId, 'owned-chat', { user });

    const res = await getLogs({ batchId: batchId.toString() });

    expect(Object.keys(res.payload.logs[0].user).sort()).toEqual(['_id', 'email']);
    expect(res.payload.logs[0].user.email).toBe('reviewer@canada.ca');
  });

  it('applies the limit', async () => {
    await dbConnect();
    const batchId = new mongoose.Types.ObjectId();
    await chatInBatch(batchId, 'first');
    await chatInBatch(batchId, 'second');

    const res = await getLogs({ batchId: batchId.toString(), limit: '1' });

    expect(res.payload.logs.map(chat => chat.chatId)).toEqual(['first']);
  });

  it.each([
    [{}, 'A valid batchId is required'],
    [{ batchId: 'not-an-id' }, 'A valid batchId is required'],
    [{ batchId: { $ne: null } }, 'A valid batchId is required'],
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
