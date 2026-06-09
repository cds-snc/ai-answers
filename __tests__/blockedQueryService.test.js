import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbConnectMock = vi.fn();
const updateOneMock = vi.fn();
const aggregateMock = vi.fn();

vi.mock('../api/db/db-connect.js', () => ({
  __esModule: true,
  default: dbConnectMock,
}));

vi.mock('../models/blockedQueryCounter.js', () => ({
  __esModule: true,
  BlockedQueryCounter: {
    updateOne: (...args) => updateOneMock(...args),
    aggregate: (...args) => aggregateMock(...args),
  },
  default: {},
}));

vi.mock('../services/ServerLoggingService.js', () => ({
  __esModule: true,
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

let BlockedQueryService;
let BLOCK_TYPES;
let classifyUserType;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../services/BlockedQueryService.js');
  BlockedQueryService = mod.default;
  BLOCK_TYPES = mod.BLOCK_TYPES;
  classifyUserType = mod.classifyUserType;
});

describe('classifyUserType', () => {
  it('returns admin for authenticated users', () => {
    expect(classifyUserType({ _id: 'u1' }, 'https://example.com')).toBe('admin');
  });

  it('returns referredPublic for anonymous users from a public GC page', () => {
    expect(classifyUserType(null, 'https://www.canada.ca/en/services.html')).toBe('referredPublic');
  });

  it('excludes CDS/internal subdomains from referredPublic', () => {
    expect(classifyUserType(null, 'https://blog.canada.ca/en/post')).toBe('publicOther');
  });

  it('returns publicOther for anonymous users from other sites', () => {
    expect(classifyUserType(null, 'https://example.com')).toBe('publicOther');
    expect(classifyUserType(null, '')).toBe('publicOther');
  });
});

describe('BlockedQueryService.record', () => {
  it('upserts an atomic increment keyed by day/type/lang/userType', async () => {
    await BlockedQueryService.record({ blockType: 'threat', lang: 'fr', user: null, referringUrl: 'https://example.com' });

    expect(updateOneMock).toHaveBeenCalledTimes(1);
    const [filter, update, options] = updateOneMock.mock.calls[0];
    expect(filter.type).toBe('threat');
    expect(filter.lang).toBe('fr');
    expect(filter.userType).toBe('publicOther');
    // date is truncated to UTC midnight
    expect(filter.date.getUTCHours()).toBe(0);
    expect(filter.date.getUTCMinutes()).toBe(0);
    expect(update).toEqual({ $inc: { count: 1 } });
    expect(options).toEqual({ upsert: true });
  });

  it('normalizes language codes to en/fr/other', async () => {
    await BlockedQueryService.record({ blockType: 'profanity', lang: 'eng' });
    expect(updateOneMock.mock.calls[0][0].lang).toBe('en');

    await BlockedQueryService.record({ blockType: 'profanity', lang: 'spa' });
    expect(updateOneMock.mock.calls[1][0].lang).toBe('other');
  });

  it('ignores unknown block types', async () => {
    await BlockedQueryService.record({ blockType: 'notARealType', lang: 'en' });
    expect(updateOneMock).not.toHaveBeenCalled();
  });

  it('never throws when the DB write fails', async () => {
    updateOneMock.mockRejectedValueOnce(new Error('db down'));
    await expect(
      BlockedQueryService.record({ blockType: 'tooShort', lang: 'en' })
    ).resolves.toBeUndefined();
  });
});

describe('BlockedQueryService.getBlockedMetrics', () => {
  it('builds the per-type bundle with en/fr/total splits', async () => {
    aggregateMock.mockResolvedValueOnce([
      { _id: { type: 'threat', lang: 'en' }, count: 3 },
      { _id: { type: 'threat', lang: 'fr' }, count: 2 },
      { _id: { type: 'tooShort', lang: 'en' }, count: 5 },
    ]);

    const { blockedQueries } = await BlockedQueryService.getBlockedMetrics({
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2026-01-07T23:59:59.999Z'),
      userType: 'all',
    });

    // every bucket is present even at zero
    for (const type of BLOCK_TYPES) {
      expect(blockedQueries[type]).toBeDefined();
    }
    expect(blockedQueries.threat).toEqual({ total: 5, en: 3, fr: 2 });
    expect(blockedQueries.tooShort).toEqual({ total: 5, en: 5, fr: 0 });
    expect(blockedQueries.profanity).toEqual({ total: 0, en: 0, fr: 0 });
    expect(blockedQueries.total).toEqual({ total: 10, en: 8, fr: 2 });
  });

  it('preserves the requested start timestamp in the date match', async () => {
    aggregateMock.mockResolvedValueOnce([]);

    const start = new Date('2026-01-01T15:45:00.000Z');
    const end = new Date('2026-01-07T23:59:59.999Z');

    await BlockedQueryService.getBlockedMetrics({
      start,
      end,
      userType: 'all',
    });

    const pipeline = aggregateMock.mock.calls[0][0];
    expect(pipeline[0].$match.date.$gte.toISOString()).toBe(start.toISOString());
    expect(pipeline[0].$match.date.$lte.toISOString()).toBe(end.toISOString());
  });

  it("maps the 'public' filter to referredPublic + publicOther", async () => {
    aggregateMock.mockResolvedValueOnce([]);
    await BlockedQueryService.getBlockedMetrics({
      start: new Date('2026-01-01'),
      end: new Date('2026-01-07'),
      userType: 'public',
    });
    const pipeline = aggregateMock.mock.calls[0][0];
    expect(pipeline[0].$match.userType).toEqual({ $in: ['referredPublic', 'publicOther'] });
  });

  it("applies no userType constraint for 'all'", async () => {
    aggregateMock.mockResolvedValueOnce([]);
    await BlockedQueryService.getBlockedMetrics({
      start: new Date('2026-01-01'),
      end: new Date('2026-01-07'),
      userType: 'all',
    });
    const pipeline = aggregateMock.mock.calls[0][0];
    expect(pipeline[0].$match.userType).toBeUndefined();
  });
});
