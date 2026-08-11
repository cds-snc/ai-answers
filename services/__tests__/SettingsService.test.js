import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbConnect = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFind = vi.hoisted(() => vi.fn());
const mockFindOneAndUpdate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRecordSettingChange = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockLogError = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../api/db/db-connect.js', () => ({
  default: mockDbConnect,
}));

vi.mock('../../models/setting.js', () => ({
  Setting: {
    find: mockFind,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}));

vi.mock('../SettingsAuditService.js', () => ({
  default: { recordSettingChange: mockRecordSettingChange },
}));

vi.mock('../ServerLoggingService.js', () => ({
  default: { error: mockLogError, info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
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

describe('SettingsService audit writes', () => {
  beforeEach(() => {
    mockFindOneAndUpdate.mockClear();
    mockRecordSettingChange.mockReset();
    mockRecordSettingChange.mockResolvedValue(undefined);
    mockLogError.mockClear();
  });

  it('records the change with the caller audit context', async () => {
    const { SettingsService } = await loadSettingsService();
    SettingsService.cache = { siteStatus: 'available' };

    await SettingsService.set('siteStatus', 'unavailable', {
      actorUserId: 'user-1',
      actorEmail: 'admin@example.com',
      source: 'admin',
    });

    expect(mockRecordSettingChange).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      actorEmail: 'admin@example.com',
      source: 'admin',
      settingKey: 'siteStatus',
      previousValue: 'available',
      newValue: 'unavailable',
    });
  });

  it('keeps the setting saved when the audit write fails', async () => {
    const { SettingsService } = await loadSettingsService();
    SettingsService.cache = { siteStatus: 'available' };
    mockRecordSettingChange.mockRejectedValue(new Error('audit collection unavailable'));

    // The setting is already persisted by the time the audit row is written, so
    // a failed audit must not surface as a failed save — the admin would see an
    // error for a change that actually took effect.
    await expect(
      SettingsService.set('siteStatus', 'unavailable', {
        actorEmail: 'admin@example.com',
        source: 'admin',
      })
    ).resolves.toBeUndefined();

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { key: 'siteStatus' },
      { value: 'unavailable' },
      { upsert: true }
    );
    expect(SettingsService.cache.siteStatus).toBe('unavailable');
    expect(mockLogError).toHaveBeenCalled();
  });

  it('does not record anything when the value is unchanged', async () => {
    const { SettingsService } = await loadSettingsService();
    SettingsService.cache = { siteStatus: 'available' };

    await SettingsService.set('siteStatus', 'available', {
      actorEmail: 'admin@example.com',
      source: 'admin',
    });

    expect(mockRecordSettingChange).not.toHaveBeenCalled();
  });

  it('skips auditing entirely when no audit context is given', async () => {
    const { SettingsService } = await loadSettingsService();
    SettingsService.cache = { siteStatus: 'available' };

    await SettingsService.set('siteStatus', 'unavailable');

    expect(mockRecordSettingChange).not.toHaveBeenCalled();
  });
});
