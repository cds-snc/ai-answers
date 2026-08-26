import { describe, it, expect } from 'vitest';
import handler from '../db-chat-search.js';
import dbConnect from '../db-connect.js';
import { Chat } from '../../../models/chat.js';

function createReq(query) {
  return {
    method: 'GET',
    query,
    path: '/api/db/db-chat-search',
    user: { role: 'admin', userId: 'admin-test' },
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

async function runGet(query) {
  const res = createRes();
  await handler(createReq(query), res);
  return res;
}

describe('db-chat-search', () => {
  it('returns chats whose chatId contains the search fragment, case-insensitively', async () => {
    await dbConnect();

    const target = await Chat.create({ chatId: 'db-chat-search-abc12345-def6-7890', interactions: [] });
    await Chat.create({ chatId: 'db-chat-search-unrelated-0000-0000', interactions: [] });

    const res = await runGet({ q: 'ABC12345' });

    expect(res.statusCode).toBe(200);
    expect(res.payload.chatIds).toContain(target.chatId);
    expect(res.payload.chatIds).not.toContain('db-chat-search-unrelated-0000-0000');
    expect(res.payload.truncated).toBe(false);
  });

  it('rejects a query shorter than the minimum length without touching the database', async () => {
    const res = await runGet({ q: 'abc' });

    expect(res.statusCode).toBe(400);
    expect(res.payload.chatIds).toBeUndefined();
  });

  it('rejects a missing query parameter', async () => {
    const res = await runGet({});

    expect(res.statusCode).toBe(400);
  });

  it('caps results and reports truncation when more chats match than the limit', async () => {
    await dbConnect();

    const prefix = 'db-chat-search-truncation-';
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => Chat.create({ chatId: `${prefix}${i}`, interactions: [] }))
    );

    const res = await runGet({ q: prefix });

    expect(res.statusCode).toBe(200);
    expect(res.payload.chatIds.length).toBe(10);
    expect(res.payload.truncated).toBe(true);
  });

  it('escapes regex special characters in the query instead of treating them as regex syntax', async () => {
    await dbConnect();
    // A query containing regex-special characters that don't appear
    // literally in any chatId should match nothing, not throw or match
    // everything via an unintended regex interpretation.
    const res = await runGet({ q: '(a+b).*c' });

    expect(res.statusCode).toBe(200);
    expect(res.payload.chatIds).toEqual([]);
  });
});
