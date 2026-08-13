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
    mockList.mockResolvedValue({ entries: [{ id: 'audit-1' }], total: 1, filteredTotal: 1 });
    const req = { method: 'GET', query: { limit: '25', skip: '10' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    };

    await handler(req, res);

    expect(mockList).toHaveBeenCalledWith({ limit: 25, skip: 10, search: '' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ entries: [{ id: 'audit-1' }], total: 1, filteredTotal: 1 });
  });

  it('passes the search term through to the service', async () => {
    mockList.mockResolvedValue({ entries: [], total: 0, filteredTotal: 0 });
    const req = { method: 'GET', query: { limit: '50', skip: '50', search: 'admin@example.com' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    };

    await handler(req, res);

    expect(mockList).toHaveBeenCalledWith({ limit: 50, skip: 50, search: 'admin@example.com' });
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
