import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSet = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../../services/SettingsService.js', () => ({
  SettingsService: { get: vi.fn(), set: mockSet },
}));
vi.mock('../../../middleware/auth.js', () => ({
  authMiddleware: vi.fn(),
  adminMiddleware: vi.fn(),
  withProtection: (fn) => fn,
}));

import handler from '../setting-handler.js';

describe('setting-handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the authenticated admin identity to the settings service', async () => {
    const req = {
      method: 'POST',
      body: { key: 'siteStatus', value: 'unavailable' },
      user: { userId: 'user-1', email: 'admin@example.com' },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(mockSet).toHaveBeenCalledWith('siteStatus', 'unavailable', {
      actorUserId: 'user-1',
      actorEmail: 'admin@example.com',
      source: 'admin',
    });
  });
});
