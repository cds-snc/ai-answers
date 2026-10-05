import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../setting-clear-search-cache.js';

const clearCacheMock = vi.hoisted(() => vi.fn());
vi.mock('../../../services/SearchResultCacheService.js', () => ({ clearSearchResultCache: clearCacheMock }));
vi.mock('../../../services/SettingsAuditService.js', () => ({
  default: { recordAuditSafely: vi.fn(), recordAction: vi.fn() },
}));
vi.mock('../../../middleware/auth.js', () => ({
  authMiddleware: vi.fn(),
  adminMiddleware: vi.fn(),
  withProtection: (callback) => callback,
}));

describe('setting-clear-search-cache', () => {
  beforeEach(() => {
    clearCacheMock.mockReset().mockResolvedValue(undefined);
  });

  it.each([true, false])('returns success: %s without a deletion count', async (success) => {
    if (!success) clearCacheMock.mockRejectedValueOnce(new Error('Cache unavailable'));
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await handler({ method: 'POST' }, res);
      expect(res.status).toHaveBeenCalledWith(success ? 200 : 500);
      expect(res.json).toHaveBeenCalledWith({ success });
    } finally {
      log.mockRestore();
    }
  });
});
