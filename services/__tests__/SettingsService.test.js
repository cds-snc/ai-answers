import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbConnect = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockSwitchDocumentDbVersion = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFind = vi.hoisted(() => vi.fn());
const mockFindOneAndUpdate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../api/db/db-connect.js', () => ({
  default: mockDbConnect,
  getActiveDocumentDbVersion: vi.fn(() => '8'),
  getDocumentDbUri: vi.fn((version) => (String(version) === '5' ? 'mongodb://docdb5' : 'mongodb://docdb8')),
  normalizeDocumentDbVersion: vi.fn((value) => (String(value || '8').trim() === '5' ? '5' : '8')),
  switchDocumentDbVersion: mockSwitchDocumentDbVersion,
}));

vi.mock('../../models/setting.js', () => ({
  Setting: {
    find: mockFind,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}));

async function loadSettingsService() {
  vi.resetModules();
  return import('../SettingsService.js');
}

describe('SettingsService refresh cache', () => {
  beforeEach(() => {
    mockDbConnect.mockClear();
    mockSwitchDocumentDbVersion.mockClear();
    mockFind.mockReset();
    mockFindOneAndUpdate.mockClear();
    mockFind.mockResolvedValue([{ key: 'siteStatus', value: 'available' }]);
  });

  afterEach(() => {
    mockFind.mockClear();
  });

  it('clears stale entries before reloading settings from the database', async () => {
    const { SettingsService } = await loadSettingsService();
    SettingsService.cache = {
      staleKey: 'stale-value',
      'database.documentdbVersion': '5',
    };

    await SettingsService.refreshCache();

    expect(SettingsService.cache.staleKey).toBeUndefined();
    expect(SettingsService.cache.siteStatus).toBe('available');
    expect(SettingsService.cache['database.documentdbVersion']).toBe('8');
    expect(mockDbConnect).toHaveBeenCalled();
    expect(mockFind).toHaveBeenCalledWith({});
  });
});
