import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbConnectMock = vi.fn();
const getTechnicalMetricsMock = vi.fn();
const withProtectionMock = vi.fn((handler) => handler);
const authMiddlewareMock = vi.fn();
const partnerOrAdminMiddlewareMock = vi.fn();

vi.mock('../api/db/db-connect.js', () => ({
  __esModule: true,
  default: dbConnectMock
}));

vi.mock('../services/MetricsService.js', () => ({
  __esModule: true,
  default: {
    getTechnicalMetrics: getTechnicalMetricsMock
  }
}));

vi.mock('../middleware/auth.js', () => ({
  withProtection: withProtectionMock,
  authMiddleware: authMiddlewareMock,
  partnerOrAdminMiddleware: partnerOrAdminMiddlewareMock
}));

describe('api/metrics/metrics-technical handler', () => {
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ default: handler } = await import('../api/metrics/metrics-technical.js'));
  });

  it('delegates to MetricsService and returns metrics payload', async () => {
    getTechnicalMetricsMock.mockResolvedValue({
      responseTime: { count: 1, median: 123, p90: 123, p95: 123, max: 123, maxChatId: 'chat-1' },
      downloadWebPage: []
    });

    const req = {
      method: 'GET',
      query: {
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-07T23:59:59.999Z'
      }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await handler(req, res);

    expect(dbConnectMock).toHaveBeenCalledTimes(1);
    expect(getTechnicalMetricsMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      metrics: {
        responseTime: { count: 1, median: 123, p90: 123, p95: 123, max: 123, maxChatId: 'chat-1' },
        downloadWebPage: []
      }
    });
  });

  it('returns 400 when date range is invalid', async () => {
    const req = {
      method: 'GET',
      query: {
        startDate: 'not-a-date',
        endDate: 'also-not-a-date'
      }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await handler(req, res);

    expect(getTechnicalMetricsMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid date range' });
  });

});
