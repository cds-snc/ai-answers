import { describe, expect, it, vi } from 'vitest';

const mockList = vi.hoisted(() => vi.fn());

vi.mock('../../../services/SettingsAuditService.js', () => ({
  default: { list: mockList },
}));
vi.mock('../../../middleware/auth.js', () => ({
  authMiddleware: vi.fn(),
  adminMiddleware: vi.fn(),
  withProtection: (fn) => fn,
}));

import handler from '../setting-audit.js';

describe('setting-audit handler', () => {
  it('returns paginated audit entries for an admin', async () => {
    mockList.mockResolvedValue({ entries: [{ id: 'audit-1' }], total: 1, hasMore: false });
    const req = { method: 'GET', query: { limit: '25', skip: '10' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    };

    await handler(req, res);

    expect(mockList).toHaveBeenCalledWith({ limit: 25, skip: 10, before: null });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ entries: [{ id: 'audit-1' }], total: 1, hasMore: false });
  });

  it('passes the paging cursor through to the service', async () => {
    mockList.mockResolvedValue({ entries: [], total: 0, hasMore: false });
    const before = '2026-08-11T12:00:00.000Z';
    const req = { method: 'GET', query: { limit: '50', skip: '50', before } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    };

    await handler(req, res);

    expect(mockList).toHaveBeenCalledWith({ limit: 50, skip: 50, before });
  });

  it('rejects unsupported methods', async () => {
    const req = { method: 'POST', query: {} };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', ['GET']);
  });
});
