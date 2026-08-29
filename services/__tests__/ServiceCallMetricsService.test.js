import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbConnectMock = vi.fn();
const updateOneMock = vi.fn();
const aggregateMock = vi.fn();

vi.mock('../../api/db/db-connect.js', () => ({
  __esModule: true,
  default: dbConnectMock,
}));

vi.mock('../../models/serviceCallErrorCounter.js', () => ({
  __esModule: true,
  ServiceCallErrorCounter: {
    updateOne: (...args) => updateOneMock(...args),
    aggregate: (...args) => aggregateMock(...args),
  },
  default: {},
}));

vi.mock('../ServerLoggingService.js', () => ({
  __esModule: true,
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

let ServiceCallMetricsService;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../ServiceCallMetricsService.js');
  ServiceCallMetricsService = mod.default;
});

describe('ServiceCallMetricsService.recordError / recordRetry', () => {
  it('upserts an atomic increment keyed by day/service/type/event', async () => {
    await ServiceCallMetricsService.recordError({ service: 'search', type: 'google' });

    expect(updateOneMock).toHaveBeenCalledTimes(1);
    const [filter, update, options] = updateOneMock.mock.calls[0];
    expect(filter.service).toBe('search');
    expect(filter.type).toBe('google');
    expect(filter.event).toBe('error');
    // date is truncated to UTC midnight
    expect(filter.date.getUTCHours()).toBe(0);
    expect(filter.date.getUTCMinutes()).toBe(0);
    expect(update).toEqual({ $inc: { count: 1 } });
    expect(options).toEqual({ upsert: true });
  });

  it('records retries under event "retry"', async () => {
    await ServiceCallMetricsService.recordRetry({ service: 'ai', type: 'context' });

    const [filter] = updateOneMock.mock.calls[0];
    expect(filter.service).toBe('ai');
    expect(filter.type).toBe('context');
    expect(filter.event).toBe('retry');
  });

  it('is a no-op when service or type is missing', async () => {
    await ServiceCallMetricsService.recordError({ service: '', type: 'google' });
    await ServiceCallMetricsService.recordRetry({ service: 'search', type: '' });
    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it('never throws when the DB write fails', async () => {
    updateOneMock.mockRejectedValueOnce(new Error('db down'));
    await expect(
      ServiceCallMetricsService.recordError({ service: 'search', type: 'canadaca' })
    ).resolves.toBeUndefined();
  });
});

describe('ServiceCallMetricsService.getMetrics', () => {
  it('groups error/retry counts by service and type', async () => {
    aggregateMock.mockResolvedValueOnce([
      { _id: { service: 'search', type: 'google', event: 'error' }, count: 3 },
      { _id: { service: 'search', type: 'google', event: 'retry' }, count: 5 },
      { _id: { service: 'search', type: 'canadaca', event: 'error' }, count: 1 },
      { _id: { service: 'ai', type: 'context', event: 'error' }, count: 2 },
      { _id: { service: 'ai', type: 'answer', event: 'retry' }, count: 4 },
    ]);

    const result = await ServiceCallMetricsService.getMetrics({
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2026-01-07T23:59:59.999Z'),
    });

    expect(result.search.google).toEqual({ errors: 3, retries: 5 });
    expect(result.search.canadaca).toEqual({ errors: 1, retries: 0 });
    expect(result.ai.context).toEqual({ errors: 2, retries: 0 });
    expect(result.ai.answer).toEqual({ errors: 0, retries: 4 });
  });

  it('returns empty buckets when there is no data', async () => {
    aggregateMock.mockResolvedValueOnce([]);
    const result = await ServiceCallMetricsService.getMetrics({
      start: new Date('2026-01-01'),
      end: new Date('2026-01-07'),
    });
    expect(result).toEqual({ search: {}, ai: {} });
  });

  it('floors a non-midnight start to UTC midnight so the oldest day bucket is not excluded', async () => {
    // Regression test: counter docs are always stored at UTC midnight, but
    // MetricsDashboard.js/TechnicalMetricsDashboard.js's default date range
    // is "now minus 7 days" — never day-aligned. Matching date >= start
    // as-is would silently drop the oldest day's whole bucket.
    aggregateMock.mockResolvedValueOnce([]);
    const start = new Date('2026-01-01T14:23:00.000Z');
    const end = new Date('2026-01-07T23:59:59.999Z');

    await ServiceCallMetricsService.getMetrics({ start, end });

    const pipeline = aggregateMock.mock.calls[0][0];
    const matchedDate = pipeline[0].$match.date;
    expect(matchedDate.$gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(matchedDate.$lte.toISOString()).toBe(end.toISOString());
  });

  it('degrades to empty buckets instead of throwing when the query fails', async () => {
    // Regression test: these counters are best-effort, so a transient DB
    // hiccup here must not fail the whole technical-metrics response that
    // MetricsService.getTechnicalMetrics builds alongside them.
    aggregateMock.mockRejectedValueOnce(new Error('db down'));
    const result = await ServiceCallMetricsService.getMetrics({
      start: new Date('2026-01-01'),
      end: new Date('2026-01-07'),
    });
    expect(result).toEqual({ search: {}, ai: {} });
  });
});
