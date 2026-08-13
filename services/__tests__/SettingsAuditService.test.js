import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConnect, mockCreate, mockFind, mockCountDocuments } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockCreate: vi.fn(),
  mockFind: vi.fn(),
  mockCountDocuments: vi.fn(),
}));

vi.mock('../../api/db/db-connect.js', () => ({ default: mockConnect }));
vi.mock('../../models/auditLog.js', () => ({
  AuditLog: {
    create: mockCreate,
    find: mockFind,
    countDocuments: mockCountDocuments,
  },
}));

import SettingsAuditService from '../SettingsAuditService.js';

describe('SettingsAuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({});
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    mockCountDocuments.mockResolvedValue(0);
  });

  it('records a setting change with actor and source metadata', async () => {
    await SettingsAuditService.recordSettingChange({
      actorUserId: 'user-1',
      actorEmail: 'admin@example.com',
      source: 'admin',
      settingKey: 'siteStatus',
      previousValue: 'available',
      newValue: 'unavailable',
    });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'user-1',
      actorEmail: 'admin@example.com',
      source: 'admin',
      action: 'setting.updated',
      settingKey: 'siteStatus',
      previousValue: 'available',
      newValue: 'unavailable',
    }));
  });

  it('redacts sensitive setting values and truncates large values', async () => {
    await SettingsAuditService.recordSettingChange({
      settingKey: 'notify.apiToken',
      previousValue: 'old-token',
      newValue: 'new-token',
    });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      previousValue: '[REDACTED]',
      newValue: '[REDACTED]',
    }));

    await SettingsAuditService.recordSettingChange({
      settingKey: 'site.baseUrl',
      previousValue: 'a'.repeat(2100),
      newValue: 'b'.repeat(2100),
    });

    const lastCall = mockCreate.mock.calls.at(-1)[0];
    expect(lastCall.previousValue).toHaveLength(2000);
    expect(lastCall.newValue).toHaveLength(2000);
  });

  it('lists audit entries newest first with pagination', async () => {
    await SettingsAuditService.list({ limit: 25, skip: 10 });

    const query = mockFind.mock.results[0].value;
    expect(mockFind).toHaveBeenCalledWith({});
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.limit).toHaveBeenCalledWith(25);
    expect(mockCountDocuments).toHaveBeenCalledWith({});
  });

  it('anchors a paged read to entries at or older than the cursor', async () => {
    const before = '2026-08-11T12:00:00.000Z';

    await SettingsAuditService.list({ limit: 50, skip: 50, before });

    // Without this window, an entry recorded between two "load more" clicks
    // shifts every later row down by one and the next page repeats a row.
    const expectedQuery = { createdAt: { $lte: new Date(before) } };
    expect(mockFind).toHaveBeenCalledWith(expectedQuery);
    expect(mockCountDocuments).toHaveBeenCalledWith(expectedQuery);
  });

  it('rejects a cursor that is not a usable date', async () => {
    await expect(SettingsAuditService.list({ before: 'not-a-date' })).rejects.toThrow(/before/i);
    expect(mockFind).not.toHaveBeenCalled();
  });
});
