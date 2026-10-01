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

describe('DataStoreService.createIndexes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUrl.mockImplementation((endpoint) => `/api/db/${endpoint}`);
  });

  it('rebuilds indexes with a POST request, not PUT', async () => {
    const mockResult = { alreadyRunning: false, rebuild: { running: true, success: [], failed: [] } };
    AuthService.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult)
    });

    const result = await DataStoreService.createIndexes();

    expect(AuthService.fetch).toHaveBeenCalledWith(
      '/api/db/db-database-management?action=createIndexes',
      { method: 'POST' }
    );
    expect(result).toEqual(mockResult);
  });
});

describe('DataStoreService.getIndexRebuildStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUrl.mockImplementation((endpoint) => `/api/db/${endpoint}`);
  });

  it('fetches the last rebuild with a GET request', async () => {
    const rebuild = { running: false, success: ['Chat'], failed: [] };
    AuthService.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ rebuild })
    });

    const result = await DataStoreService.getIndexRebuildStatus();

    expect(AuthService.fetch).toHaveBeenCalledWith('/api/db/db-database-management?action=indexRebuildStatus');
    expect(result).toEqual(rebuild);
  });
});

describe('DataStoreService.getSettingStrict / getSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUrl.mockImplementation((endpoint) => `/api/setting/${endpoint}`);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('getSettingStrict throws when the request fails', async () => {
    AuthService.fetch.mockResolvedValueOnce({ ok: false });
    await expect(DataStoreService.getSettingStrict('a.key', 'false')).rejects.toThrow('a.key');
  });

  it('getSetting still falls back to the default when the request fails', async () => {
    AuthService.fetch.mockResolvedValueOnce({ ok: false });
    await expect(DataStoreService.getSetting('a.key', 'false')).resolves.toBe('false');
  });

  it('both return the saved value', async () => {
    AuthService.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ value: 'true' }) });
    await expect(DataStoreService.getSettingStrict('a.key', 'false')).resolves.toBe('true');
    await expect(DataStoreService.getSetting('a.key', 'false')).resolves.toBe('true');
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

  it('uses the default for a setting the server returns as null (never saved)', async () => {
    AuthService.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ values: { 'downloadWebPage.cache.durationHours': null } })
    });

    const result = await DataStoreService.getSettings(
      ['downloadWebPage.cache.durationHours'],
      { 'downloadWebPage.cache.durationHours': '12' }
    );

    expect(result).toEqual({ 'downloadWebPage.cache.durationHours': '12' });
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
