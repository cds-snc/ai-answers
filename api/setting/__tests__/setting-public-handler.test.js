import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/SettingsService.js', () => ({
  SettingsService: { get: vi.fn() },
}));

import { SettingsService } from '../../../services/SettingsService.js';
import handler from '../setting-public-handler.js';

describe('setting-public-handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns allowlisted public settings', async () => {
    SettingsService.get.mockReturnValue('available');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    await handler({ method: 'GET', query: { key: 'siteStatus' } }, res);

    expect(SettingsService.get).toHaveBeenCalledWith('siteStatus');
    expect(res.json).toHaveBeenCalledWith({ key: 'siteStatus', value: 'available' });
  });

  it('does not return settings outside the public allowlist', async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    await handler({ method: 'GET', query: { key: 'session.defaultTTLMinutes' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(SettingsService.get).not.toHaveBeenCalled();
  });
});
