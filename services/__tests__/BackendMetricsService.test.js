import { beforeEach, describe, expect, it, vi } from 'vitest';

const aggregateMock = vi.fn();
const allowDiskUseMock = vi.fn();

vi.mock('../../models/chat.js', () => ({
  Chat: {
    aggregate: aggregateMock
  }
}));

vi.mock('../../api/metrics/metrics-common.js', () => ({
  getBaseInteractionPipeline: vi.fn(() => []),
  executeWithRetry: async (aggregateFn) => aggregateFn()
}));

describe('Backend MetricsService.getTechnicalMetrics', () => {
  let MetricsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    allowDiskUseMock.mockReset();
    aggregateMock.mockReturnValue({
      allowDiskUse: allowDiskUseMock
    });
    ({ default: MetricsService } = await import('../MetricsService.js'));
  });

  it('computes response-time and downloadWebPage statistics', async () => {
    allowDiskUseMock.mockResolvedValue([
      {
        chatId: 'chat-a',
        rt: 100,
        downloadCalls: [
          { duration: 20, status: 'completed' },
          { duration: 50, status: 'error' }
        ]
      },
      {
        chatId: 'chat-b',
        rt: 200,
        downloadCalls: [
          { duration: 40, status: 'completed' },
          { duration: 90, status: 'completed' }
        ]
      },
      {
        chatId: 'chat-c',
        rt: 400,
        downloadCalls: [
          { duration: 10, status: 'error' },
          { duration: 120, status: 'completed' }
        ]
      }
    ]);

    const metrics = await MetricsService.getTechnicalMetrics({
      dateFilter: { createdAt: { $gte: new Date('2026-01-01'), $lte: new Date('2026-01-08') } },
      extraFilterConditions: [],
      departmentFilter: [],
      answerTypeFilter: null,
      partnerEvalFilter: null,
      aiEvalFilter: null
    });

    expect(aggregateMock).toHaveBeenCalledTimes(1);
    expect(allowDiskUseMock).toHaveBeenCalledWith(true);

    expect(metrics.responseTime).toEqual({
      count: 3,
      median: 200,
      p90: 400,
      p95: 400,
      max: 400,
      maxChatId: 'chat-c'
    });

    expect(metrics.downloadWebPage).toEqual([
      {
        callNumber: 1,
        totalCount: 3,
        errorCount: 1,
        completedCount: 2,
        median: 40,
        p95: 40
      },
      {
        callNumber: 2,
        totalCount: 3,
        errorCount: 1,
        completedCount: 2,
        median: 120,
        p95: 120
      }
    ]);
  });

  it('returns default response-time metrics when no positive latencies exist', async () => {
    allowDiskUseMock.mockResolvedValue([
      { chatId: 'chat-a', rt: 0, downloadCalls: [] },
      { chatId: 'chat-b', rt: null, downloadCalls: [] }
    ]);

    const metrics = await MetricsService.getTechnicalMetrics({
      dateFilter: { createdAt: { $gte: new Date('2026-01-01'), $lte: new Date('2026-01-08') } }
    });

    expect(metrics.responseTime).toEqual({
      count: 0,
      median: 0,
      p90: 0,
      p95: 0,
      max: 0,
      maxChatId: ''
    });
    expect(metrics.downloadWebPage).toEqual([]);
  });
});
