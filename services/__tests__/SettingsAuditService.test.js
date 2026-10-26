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

  it('filters by a case-insensitive search across the visible columns', async () => {
    await SettingsAuditService.list({ search: 'admin@example.com' });

    const query = mockFind.mock.calls[0][0];
    expect(query.$or).toEqual([
      { actorEmail: expect.any(RegExp) },
      { settingKey: expect.any(RegExp) },
      { action: expect.any(RegExp) },
      { previousValue: expect.any(RegExp) },
      { newValue: expect.any(RegExp) },
    ]);
    expect(query.$or[0].actorEmail.test('ADMIN@example.com')).toBe(true);
  });

  it('escapes regex metacharacters in the search term so they match literally', async () => {
    await SettingsAuditService.list({ search: 'a.b(c' });

    const pattern = mockFind.mock.calls[0][0].$or[0].actorEmail;
    expect(pattern.test('a.b(c')).toBe(true);
    // An unescaped "." would match any character here too — confirms the
    // term was escaped rather than compiled as a live regex pattern.
    expect(pattern.test('axb(c')).toBe(false);
  });

  it('runs a second unfiltered count only when a search is active, and returns both totals', async () => {
    mockCountDocuments.mockResolvedValueOnce(2).mockResolvedValueOnce(9);

    const result = await SettingsAuditService.list({ search: 'unavailable' });

    expect(mockCountDocuments).toHaveBeenCalledTimes(2);
    expect(result.filteredTotal).toBe(2);
    expect(result.total).toBe(9);
  });

  it('skips the extra count query when there is no search', async () => {
    mockCountDocuments.mockResolvedValueOnce(7);

    const result = await SettingsAuditService.list({});

    expect(mockCountDocuments).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(7);
    expect(result.filteredTotal).toBe(7);
  });
});
