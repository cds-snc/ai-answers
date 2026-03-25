import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock dependencies so the module falls back to in-memory limiters
vi.mock('../api/db/db-connect.js', () => ({
  default: vi.fn().mockResolvedValue(true)
}));
vi.mock('../services/SettingsService.js', () => ({
  SettingsService: { get: vi.fn().mockReturnValue('memory') }
}));

import {
  resetPasswordRateLimit,
  sendResetRateLimit,
  initializeAuthRateLimiter,
} from '../middleware/auth-rate-limiter.js';

beforeAll(async () => {
  await initializeAuthRateLimiter();
});

function makeReq(email = 'test@example.com', ip = '127.0.0.1') {
  return { body: { email }, ip };
}

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
}

/** Helper: call middleware and return whether next() was called or a response was sent */
function callMiddleware(mw, req) {
  const res = makeRes();
  return new Promise((resolve) => {
    mw(req, res, () => resolve({ allowed: true, res }))
      .then(() => {
        // If next() wasn't called, the middleware responded
        if (!res.status.mock.calls.length) return; // next() path already resolved
        resolve({ allowed: false, res });
      })
      .catch(() => resolve({ allowed: false, res }));
  });
}

describe('Auth Rate Limiter - resetPasswordRateLimit', () => {
  it('allows requests within limit', async () => {
    let allowed = 0;
    for (let i = 0; i < 5; i++) {
      const result = await callMiddleware(
        resetPasswordRateLimit,
        makeReq(`unique-reset-${Date.now()}-${i}@test.com`)
      );
      if (result.allowed) allowed++;
    }
    expect(allowed).toBe(5);
  });

  it('blocks after exceeding limit for same IP+email', async () => {
    const email = `rate-reset-block-${Date.now()}@test.com`;
    let allowed = 0;
    let blocked = false;
    let blockedRes = null;

    // Exhaust 5 allowed attempts then try a 6th
    for (let i = 0; i < 6; i++) {
      const result = await callMiddleware(resetPasswordRateLimit, makeReq(email));
      if (result.allowed) {
        allowed++;
      } else {
        blocked = true;
        blockedRes = result.res;
      }
    }

    expect(allowed).toBe(5);
    expect(blocked).toBe(true);
    expect(blockedRes.status).toHaveBeenCalledWith(429);
  });
});

describe('Auth Rate Limiter - sendResetRateLimit', () => {
  it('blocks after 3 attempts for same IP+email', async () => {
    const email = `rate-send-block-${Date.now()}@test.com`;
    let allowed = 0;
    let blocked = false;
    let blockedRes = null;

    for (let i = 0; i < 4; i++) {
      const result = await callMiddleware(sendResetRateLimit, makeReq(email));
      if (result.allowed) {
        allowed++;
      } else {
        blocked = true;
        blockedRes = result.res;
      }
    }

    expect(allowed).toBe(3);
    expect(blocked).toBe(true);
    expect(blockedRes.status).toHaveBeenCalledWith(429);
  });
});
