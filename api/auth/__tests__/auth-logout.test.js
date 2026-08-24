import { describe, expect, it, vi } from 'vitest';
import logoutHandler from '../auth-logout.js';

describe('auth logout handler', () => {
  it('destroys the session and clears the parent-domain cookie', () => {
    const req = {
      get: vi.fn(() => 'ai-answers.alpha.canada.ca'),
      logout: vi.fn((callback) => callback(null)),
      session: {
        destroy: vi.fn((callback) => callback(null)),
      },
    };
    const res = {
      clearCookie: vi.fn(),
      status: vi.fn(function status() { return this; }),
      json: vi.fn(),
    };

    logoutHandler(req, res);

    expect(req.session.destroy).toHaveBeenCalledOnce();
    expect(res.clearCookie).toHaveBeenCalledOnce();
    expect(res.clearCookie).toHaveBeenCalledWith('aianswers.sid', {
      domain: '.alpha.canada.ca',
      path: '/',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('clears a host-only cookie when no parent domain is valid', () => {
    const req = {
      get: vi.fn(() => 'localhost:3001'),
      logout: vi.fn((callback) => callback(null)),
      session: {
        destroy: vi.fn((callback) => callback(null)),
      },
    };
    const res = {
      clearCookie: vi.fn(),
      status: vi.fn(function status() { return this; }),
      json: vi.fn(),
    };

    logoutHandler(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith('aianswers.sid', { path: '/' });
  });
});
