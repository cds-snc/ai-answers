import { describe, expect, it, vi, beforeEach } from 'vitest';
import handler from '../setting-bulk-handler.js';
import { SettingsService } from '../../../services/SettingsService.js';

vi.mock('../../../services/SettingsService.js', () => ({
  SettingsService: {
    get: vi.fn((key) => ({
      'siteStatus': 'available',
      'session.defaultTTLMinutes': '60',
      'redaction.profanity.en': 'bad word',
    })[key] ?? null),
  },
}));

vi.mock('../../../middleware/auth.js', () => ({
  authMiddleware: vi.fn(),
  adminMiddleware: vi.fn(),
  withProtection: (fn) => fn,
}));

describe('setting-bulk-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns multiple settings in one response', async () => {
    const req = {
      method: 'POST',
      body: {
        keys: ['siteStatus', 'session.defaultTTLMinutes', 'redaction.profanity.en'],
      },
    };
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(SettingsService.get).toHaveBeenCalledTimes(3);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      values: {
        siteStatus: 'available',
        'session.defaultTTLMinutes': '60',
        'redaction.profanity.en': 'bad word',
      },
    });
  });
});
