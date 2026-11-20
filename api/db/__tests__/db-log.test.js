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

  it('returns logs for a partner', async () => {
    getLogs.mockResolvedValue({ logs: [{ message: 'node:init output' }], total: 1, hasMore: false });
    const res = createRes();
    await handler({
      method: 'GET',
      path: '/api/db/db-log',
      query: { chatId: 'chat-1', limit: '1000' },
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
});
