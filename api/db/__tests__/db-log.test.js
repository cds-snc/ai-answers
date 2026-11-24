import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { log, getLogs } = vi.hoisted(() => ({
  log: vi.fn(),
  getLogs: vi.fn(),
}));

vi.mock('../../../services/ServerLoggingService.js', () => ({
  default: { log, getLogs },
}));

import handler from '../db-log.js';

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    end(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe('db-log', () => {
  beforeEach(() => {
    log.mockClear();
    getLogs.mockReset();
  });

  it('rejects POST without writing a log', async () => {
    const res = createRes();
    await handler({
      method: 'POST',
      body: {
        chatId: '11111111-1111-4111-8111-111111111111',
        logLevel: 'error',
        message: 'redaction failure',
        metadata: { note: 'forged' },
      },
    }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    expect(log).not.toHaveBeenCalled();
    expect(getLogs).not.toHaveBeenCalled();
  });

  it('registers every method so a write reaches this handler', () => {
    // Unregistered API methods are rejected with 404 before this file runs.
    const source = readFileSync(new URL('../../../server/server.js', import.meta.url), 'utf8');
    const registrations = [...source.matchAll(/app\.(\w+)\(\s*['"]\/api\/db\/db-log['"]/g)].map((match) => match[1]);
    expect(registrations).toEqual(['all']);
  });

  it('still requires a partner or admin to read logs', async () => {
    const res = createRes();
    await handler({
      method: 'GET',
      path: '/api/db/db-log',
      query: { chatId: '11111111-1111-4111-8111-111111111111' },
      isAuthenticated: () => false,
    }, res);

    expect(res.statusCode).toBe(401);
    expect(getLogs).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('rejects a signed-in user who is not a partner or admin', async () => {
    const res = createRes();
    await handler({
      method: 'GET',
      path: '/api/db/db-log',
      query: { chatId: '11111111-1111-4111-8111-111111111111' },
      isAuthenticated: () => true,
      user: { role: 'user', userId: 'user-1' },
    }, res);

    expect(res.statusCode).toBe(403);
    expect(res.payload).toEqual({ message: 'Partner or admin access required' });
    expect(getLogs).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('returns logs for a partner', async () => {
    getLogs.mockResolvedValue({ logs: [{ message: 'node:init output' }], total: 1, hasMore: false });
    const res = createRes();
    await handler({
      method: 'GET',
      path: '/api/db/db-log',
      query: { chatId: ' chat-1 ', limit: '1000', skip: '0' },
      isAuthenticated: () => true,
      user: { role: 'partner', userId: 'partner-1' },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.logs).toEqual([{ message: 'node:init output' }]);
    expect(getLogs).toHaveBeenCalledWith({
      chatId: 'chat-1',
      level: null,
      skip: 0,
      limit: 1000,
    });
    expect(log).not.toHaveBeenCalled();
  });

  it('rejects a missing chat id, a page size of 0, and a skip that is not a whole number', async () => {
    const missingChat = createRes();
    await handler({
      method: 'GET',
      path: '/api/db/db-log',
      query: { limit: '20' },
      isAuthenticated: () => true,
      user: { role: 'admin', userId: 'admin-1' },
    }, missingChat);

    expect(missingChat.statusCode).toBe(400);
    expect(missingChat.payload).toEqual({ error: 'Invalid chatId' });

    const blankChat = createRes();
    await handler({
      method: 'GET',
      path: '/api/db/db-log',
      query: { chatId: '   ' },
      isAuthenticated: () => true,
      user: { role: 'admin', userId: 'admin-1' },
    }, blankChat);

    expect(blankChat.statusCode).toBe(400);
    expect(blankChat.payload).toEqual({ error: 'Invalid chatId' });

    const zeroLimit = createRes();
    await handler({
      method: 'GET',
      path: '/api/db/db-log',
      query: { chatId: 'chat-1', limit: '0' },
      isAuthenticated: () => true,
      user: { role: 'admin', userId: 'admin-1' },
    }, zeroLimit);

    expect(zeroLimit.statusCode).toBe(400);
    expect(zeroLimit.payload).toEqual({ error: 'Invalid limit' });

    const overLimit = createRes();
    await handler({
      method: 'GET',
      path: '/api/db/db-log',
      query: { chatId: 'chat-1', limit: '1001' },
      isAuthenticated: () => true,
      user: { role: 'admin', userId: 'admin-1' },
    }, overLimit);

    expect(overLimit.statusCode).toBe(400);
    expect(overLimit.payload).toEqual({ error: 'Invalid limit' });

    const badSkip = createRes();
    await handler({
      method: 'GET',
      path: '/api/db/db-log',
      query: { chatId: 'chat-1', skip: '-1' },
      isAuthenticated: () => true,
      user: { role: 'admin', userId: 'admin-1' },
    }, badSkip);

    expect(badSkip.statusCode).toBe(400);
    expect(badSkip.payload).toEqual({ error: 'Invalid skip' });

    const omittedLimit = createRes();
    getLogs.mockResolvedValue({ logs: [], total: 0, hasMore: false });
    await handler({
      method: 'GET',
      path: '/api/db/db-log',
      query: { chatId: 'chat-1' },
      isAuthenticated: () => true,
      user: { role: 'admin', userId: 'admin-1' },
    }, omittedLimit);

    expect(omittedLimit.statusCode).toBe(200);
    expect(getLogs).toHaveBeenCalledTimes(1);
    expect(getLogs).toHaveBeenCalledWith({
      chatId: 'chat-1',
      level: null,
      skip: 0,
      limit: 1000,
    });
  });
});
