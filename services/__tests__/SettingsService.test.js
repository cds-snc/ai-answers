import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbConnect = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFind = vi.hoisted(() => vi.fn());
const mockFindOneAndUpdate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRecordSettingChange = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRecordSettingChangeBatch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
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

vi.mock('../ServerLoggingService.js', () => ({
  default: { error: mockLogError, info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../SettingsAuditService.js', () => ({
  default: {
    recordSettingChange: mockRecordSettingChange,
    recordSettingChangeBatch: mockRecordSettingChangeBatch,
    // Mirrors the real recordAuditSafely: run recordFn, log-and-swallow on
    // failure — the two tests below rely on this to exercise SettingsService's
    // "a failed audit write must not fail the save" contract.
    recordAuditSafely: async (recordFn, failureMessage) => {
      try {
        return await recordFn();
      } catch (error) {
        await mockLogError(failureMessage, 'system', error);
      }
    },
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
    // Mongoose's findOneAndUpdate defaults to returning the pre-update
    // document — previousValue comes from this, not a separate cache read.
    mockFindOneAndUpdate.mockResolvedValue({ value: 'available' });

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
    mockFindOneAndUpdate.mockResolvedValue({ value: 'available' });
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
    mockFindOneAndUpdate.mockResolvedValue({ value: 'available' });

    await SettingsService.set('siteStatus', 'available', {
      actorEmail: 'admin@example.com',
      source: 'admin',
    });

    expect(mockRecordSettingChange).not.toHaveBeenCalled();
  });

  it('takes previousValue from the write itself, not a stale cache read', async () => {
    const { SettingsService } = await loadSettingsService();
    // Stale cache — see the equivalent setMany test for why this matters.
    SettingsService.cache = { siteStatus: 'available' };
    mockFindOneAndUpdate.mockResolvedValue({ value: 'unavailable' });

    await SettingsService.set('siteStatus', 'restored', {
      actorEmail: 'admin@example.com',
      source: 'admin',
    });

    expect(mockRecordSettingChange).toHaveBeenCalledWith(expect.objectContaining({
      previousValue: 'unavailable',
      newValue: 'restored',
    }));
  });

  it('lets an explicit auditContext.previousValue override the write result', async () => {
    const { SettingsService } = await loadSettingsService();
    SettingsService.cache = { siteStatus: 'available' };
    mockFindOneAndUpdate.mockResolvedValue({ value: 'unavailable' });

    // SystemHealthMonitor.js passes its own previousValue when it already
    // captured the pre-change value as part of its own logic.
    await SettingsService.set('siteStatus', 'restored', {
      actorEmail: 'System health monitor',
      source: 'system',
      previousValue: 'captured-earlier',
    });

    expect(mockRecordSettingChange).toHaveBeenCalledWith(expect.objectContaining({
      previousValue: 'captured-earlier',
      newValue: 'restored',
    }));
  });

  it('skips auditing entirely when no audit context is given', async () => {
    const { SettingsService } = await loadSettingsService();
    SettingsService.cache = { siteStatus: 'available' };

    await SettingsService.set('siteStatus', 'unavailable');

    expect(mockRecordSettingChange).not.toHaveBeenCalled();
  });
});

describe('SettingsService.set field format validation', () => {
  beforeEach(() => {
    mockFindOneAndUpdate.mockClear();
    mockRecordSettingChange.mockReset();
    mockRecordSettingChange.mockResolvedValue(undefined);
  });

  it('rejects a malformed email in alertRecipients', async () => {
    const { SettingsService } = await loadSettingsService();
    SettingsService.cache = { 'systemHealth.alertRecipients': '' };

    // The thrown error carries a translation key rather than a formatted
    // sentence — this is server-side code with no access to the admin's UI
    // language, so the frontend (not here) resolves it via t().
    await expect(
      SettingsService.set('systemHealth.alertRecipients', 'not-an-email', {
        actorEmail: 'admin@example.com',
        source: 'admin',
      })
    ).rejects.toMatchObject({
      i18nKey: 'settings.validation.invalidEmail',
    });

    // Nothing should have been written — validation runs before any DB call.
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('accepts a semicolon-separated list of valid emails', async () => {
    const { SettingsService } = await loadSettingsService();
    SettingsService.cache = { 'systemHealth.alertRecipients': '' };

    await SettingsService.set(
      'systemHealth.alertRecipients',
      'ops@example.com; admin@example.com',
      { actorEmail: 'admin@example.com', source: 'admin' }
    );

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { key: 'systemHealth.alertRecipients' },
      { value: 'ops@example.com; admin@example.com' },
      { upsert: true }
    );
  });
});

describe('SettingsService.setMany', () => {
  beforeEach(() => {
    mockFindOneAndUpdate.mockClear();
    mockFindOneAndUpdate.mockResolvedValue(undefined);
    mockRecordSettingChangeBatch.mockReset();
    mockRecordSettingChangeBatch.mockResolvedValue(undefined);
    mockLogError.mockClear();
  });

  it('saves the valid fields in a batch even when another field fails validation', async () => {
    const { SettingsService } = await loadSettingsService();
    SettingsService.cache = {
      siteStatus: 'available',
      'systemHealth.alertRecipients': '',
    };
    mockFindOneAndUpdate.mockResolvedValue({ value: 'available' });

    const { values, errors } = await SettingsService.setMany(
      [
        { key: 'siteStatus', value: 'unavailable' },
        { key: 'systemHealth.alertRecipients', value: 'not-an-email' },
      ],
      { actorEmail: 'admin@example.com', source: 'admin' }
    );

    // The bad field is reported, not thrown — earlier behavior aborted the
    // whole batch on the first bad field with no way to say which one.
    expect(values).toEqual({ siteStatus: 'unavailable' });
    expect(errors).toEqual({
      'systemHealth.alertRecipients': { i18nKey: 'settings.validation.invalidEmail' },
    });

    // Only the valid field was actually written and audited.
    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { key: 'siteStatus' },
      { value: 'unavailable' },
      { upsert: true }
    );
    expect(mockRecordSettingChangeBatch).toHaveBeenCalledWith({
      actorEmail: 'admin@example.com',
      source: 'admin',
      entries: [{ settingKey: 'siteStatus', previousValue: 'available', newValue: 'unavailable' }],
    });
  });

  it('reports a write failure per key without losing the other results', async () => {
    const { SettingsService } = await loadSettingsService();
    SettingsService.cache = { siteStatus: 'available', deploymentMode: 'CDS' };
    mockFindOneAndUpdate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('DocumentDB write conflict'));

    const { values, errors } = await SettingsService.setMany([
      { key: 'siteStatus', value: 'unavailable' },
      { key: 'deploymentMode', value: 'Vercel' },
    ]);

    expect(values).toEqual({ siteStatus: 'unavailable' });
    expect(errors).toEqual({ deploymentMode: 'DocumentDB write conflict' });
  });

  it('takes previousValue from the write itself, not a cache read, so a concurrent change to the same key is not misreported', async () => {
    const { SettingsService } = await loadSettingsService();
    // The in-memory cache still says 'available' (stale — some other
    // concurrent request already wrote 'unavailable' to the DB and hasn't
    // updated this process's cache yet, e.g. a race between two admin tabs).
    // previousValue must reflect the DB's actual prior value ('unavailable'),
    // not the stale cache read, or the audit trail would misrepresent what
    // this write actually changed.
    SettingsService.cache = { siteStatus: 'available' };
    mockFindOneAndUpdate.mockResolvedValue({ value: 'unavailable' });

    await SettingsService.setMany(
      [{ key: 'siteStatus', value: 'restored' }],
      { actorEmail: 'admin@example.com', source: 'admin' }
    );

    expect(mockRecordSettingChangeBatch).toHaveBeenCalledWith({
      actorEmail: 'admin@example.com',
      source: 'admin',
      entries: [{ settingKey: 'siteStatus', previousValue: 'unavailable', newValue: 'restored' }],
    });
  });

  it('never calls the audit batch write when nothing actually changed', async () => {
    const { SettingsService } = await loadSettingsService();
    SettingsService.cache = { siteStatus: 'available' };
    mockFindOneAndUpdate.mockResolvedValue({ value: 'available' });

    await SettingsService.setMany(
      [{ key: 'siteStatus', value: 'available' }],
      { actorEmail: 'admin@example.com', source: 'admin' }
    );

    expect(mockRecordSettingChangeBatch).not.toHaveBeenCalled();
  });
});
