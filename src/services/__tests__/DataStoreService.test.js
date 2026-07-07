import { describe, it, expect, vi, beforeEach } from 'vitest';
import DataStoreService from '../DataStoreService.js';
import AuthService from '../AuthService.js';
import { getApiUrl } from '../../utils/apiToUrl.js';

vi.mock('../AuthService.js');
vi.mock('../../utils/apiToUrl.js');

describe('DataStoreService.checkIndexStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUrl.mockImplementation((endpoint) => `/api/db/${endpoint}`);
  });

  it('fetches index status with a GET request', async () => {
    const mockStatus = { message: 'All indexes are complete', collections: [] };
    AuthService.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockStatus)
    });

    const result = await DataStoreService.checkIndexStatus();

    expect(AuthService.fetch).toHaveBeenCalledWith('/api/db/db-database-management?action=indexStatus');
    expect(result).toEqual(mockStatus);
  });
});

describe('DataStoreService.getSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUrl.mockImplementation((endpoint) => `/api/db/${endpoint}`);
  });

  it('fetches multiple settings in one request', async () => {
    const mockValues = {
      'siteStatus': 'available',
      'session.defaultTTLMinutes': '60',
      'redaction.profanity.en': 'bad word',
    };

    AuthService.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ values: mockValues })
    });

    const result = await DataStoreService.getSettings(
      ['siteStatus', 'session.defaultTTLMinutes', 'redaction.profanity.en', 'missing.setting'],
      { 'missing.setting': 'fallback' }
    );

    expect(AuthService.fetch).toHaveBeenCalledWith('/api/db/setting-bulk-handler', expect.objectContaining({
      method: 'POST',
    }));
    expect(result).toEqual({
      siteStatus: 'available',
      'session.defaultTTLMinutes': '60',
      'redaction.profanity.en': 'bad word',
      'missing.setting': 'fallback',
    });
  });

  it('falls back to individual setting reads when the bulk endpoint is unavailable', async () => {
    AuthService.fetch
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'Not found' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: 'siteStatus', value: 'available' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: 'session.defaultTTLMinutes', value: null }),
      });

    const result = await DataStoreService.getSettings(
      ['siteStatus', 'session.defaultTTLMinutes'],
      { 'session.defaultTTLMinutes': '60' }
    );

    expect(AuthService.fetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      siteStatus: 'available',
      'session.defaultTTLMinutes': '60',
    });
  });
});
