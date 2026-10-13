import { describe, it, expect, vi } from 'vitest';
import { createAuthRateLimiter } from '../middleware/auth-rate-limiter.js';

const makeRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.setHeader = vi.fn();
  return res;
};

describe('auth rate limiter', () => {
  it('blocks an IP after the limit on POST and sets Retry-After', async () => {
    const limiter = createAuthRateLimiter({ points: 2, duration: 60 });
    const next = vi.fn();
    for (let i = 0; i < 2; i += 1) await limiter({ method: 'POST', ip: '10.0.0.1' }, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(2);

    const res = makeRes();
    await limiter({ method: 'POST', ip: '10.0.0.1' }, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('keeps each IP separate and ignores GET (auth-me polling)', async () => {
    const limiter = createAuthRateLimiter({ points: 1, duration: 60 });
    const next = vi.fn();
    await limiter({ method: 'POST', ip: '10.0.0.1' }, makeRes(), next);
    await limiter({ method: 'POST', ip: '10.0.0.2' }, makeRes(), next);
    for (let i = 0; i < 5; i += 1) await limiter({ method: 'GET', ip: '10.0.0.1' }, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(7);
  });
});
