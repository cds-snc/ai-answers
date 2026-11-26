import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db-connect.js', () => ({
  default: vi.fn(),
}));

import handler from '../db-check.js';
import dbConnect from '../db-connect.js';

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
  };
}

function adminReq(method = 'GET') {
  return {
    method,
    path: '/api/db/db-check',
    isAuthenticated: () => true,
    user: { role: 'admin', userId: 'admin-1' },
  };
}

describe('db-check', () => {
  beforeEach(() => {
    dbConnect.mockReset();
  });

  it('rejects an unauthenticated caller before connecting', async () => {
    const res = createRes();
    await handler({
      method: 'GET',
      path: '/api/db/db-check',
      isAuthenticated: () => false,
    }, res);

    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ message: 'Authentication required' });
    expect(dbConnect).not.toHaveBeenCalled();
  });

  it('rejects a signed-in user who is not an admin', async () => {
    const res = createRes();
    await handler({
      method: 'GET',
      path: '/api/db/db-check',
      isAuthenticated: () => true,
      user: { role: 'partner', userId: 'partner-1' },
    }, res);

    expect(res.statusCode).toBe(403);
    expect(res.payload).toEqual({ message: 'Admin access required' });
    expect(dbConnect).not.toHaveBeenCalled();
  });

  it('reports a successful connection without the database name', async () => {
    dbConnect.mockResolvedValue({ connections: [{ name: 'ai-answers-prod' }] });
    const res = createRes();
    await handler(adminReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ message: 'Database connected successfully' });
    expect(JSON.stringify(res.payload)).not.toContain('ai-answers-prod');
  });

  it('returns a generic failure without the driver error or stack', async () => {
    const error = new Error('connect ECONNREFUSED mongo.internal.example:27017');
    error.stack = 'Error: connect ECONNREFUSED\n    at db-connect.js:1:1';
    dbConnect.mockRejectedValue(error);
    const res = createRes();
    await handler(adminReq(), res);

    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ message: 'Failed to connect to database' });
    expect(JSON.stringify(res.payload)).not.toContain('mongo.internal.example');
    expect(JSON.stringify(res.payload)).not.toContain('db-connect.js');
  });

  it('handles an authentication throw without an unhandled rejection', async () => {
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const res = createRes();
      // The server mounts this handler without awaiting it; let the wrapper finish.
      handler({
        method: 'GET',
        path: '/api/db/db-check',
        isAuthenticated: () => {
          throw new Error('session store exploded');
        },
      }, res);
      await new Promise((resolve) => setImmediate(resolve));

      expect(unhandled).toEqual([]);
      expect(res.statusCode).toBe(500);
      expect(res.payload).toEqual({ message: 'Failed to complete database check' });
      expect(JSON.stringify(res.payload)).not.toContain('session store');
      expect(dbConnect).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('rejects a non-GET method before authentication', async () => {
    const res = createRes();
    await handler({ method: 'POST', path: '/api/db/db-check' }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    expect(res.payload).toEqual({ message: 'Method Not Allowed' });
    expect(dbConnect).not.toHaveBeenCalled();
  });
});
