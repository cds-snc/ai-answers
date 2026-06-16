import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbConnect = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFind = vi.hoisted(() => vi.fn());
const mockFindOneAndUpdate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../api/db/db-connect.js', () => ({
  default: mockDbConnect,
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
    };

    await SettingsService.refreshCache();

    expect(SettingsService.cache.staleKey).toBeUndefined();
    expect(SettingsService.cache.siteStatus).toBe('available');
    expect(mockDbConnect).toHaveBeenCalled();
    expect(mockFind).toHaveBeenCalledWith({});
  });
});
