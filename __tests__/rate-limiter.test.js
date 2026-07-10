import { beforeEach, describe, expect, it, vi } from 'vitest';

const { consumeMock } = vi.hoisted(() => ({
  consumeMock: vi.fn()
}));

vi.mock('rate-limiter-flexible', () => ({
  RateLimiterMemory: vi.fn(function RateLimiterMemory() {
    this.consume = consumeMock;
    this.points = 60;
    this.duration = 60;
  }),
  RateLimiterMongo: vi.fn(function RateLimiterMongo() {
    this.consume = consumeMock;
    this.points = 60;
    this.duration = 60;
  })
}));

vi.mock('../services/SettingsService.js', () => ({
  SettingsService: {
    get: vi.fn()
  }
}));

vi.mock('../api/db/db-connect.js', () => ({
  default: vi.fn().mockResolvedValue(true)
}));

import { initializeRateLimiter, rateLimiterMiddleware, rateLimiters } from '../middleware/rate-limiter.js';
import { SettingsService } from '../services/SettingsService.js';

describe('rateLimiterMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeMock.mockReset();
    SettingsService.get.mockImplementation((key) => {
      if (key === 'session.rateLimitPersistence') return 'memory';
      if (key === 'session.rateLimitCapacity') return '60';
      if (key === 'session.authenticatedRateLimitCapacity') return '300';
      if (key === 'session.rateLimitRefillPerSec') return '60';
      if (key === 'session.authenticatedRateLimitRefillPerSec') return '300';
      return null;
    });
  });

  it('returns a friendly 429 with a debug count when the quota is exhausted', async () => {
    consumeMock.mockRejectedValueOnce({
      msBeforeNext: 4500,
      consumedPoints: 12
    });

    await initializeRateLimiter();

    const req = { ip: '127.0.0.1' };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await rateLimiterMiddleware(req, res, next);

    expect(rateLimiters.public).toBeTruthy();
    expect(consumeMock).toHaveBeenCalledWith('127.0.0.1');
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'RATE_LIMITED',
      message: "Looks like you're using the system a lot. Please wait a few minutes for more capacity.",
      currentCount: 12,
      retryAfterSeconds: 5
    });
    expect(next).not.toHaveBeenCalled();
  });
});
