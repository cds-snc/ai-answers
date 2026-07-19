import { describe, it, expect, vi, beforeEach } from 'vitest';
import programHandler from '../api/metrics/metrics-programs.js';
import { NON_NORMAL_ANSWER_TYPES } from '../api/util/answerTypes.js';
import * as ChatModel from '../models/chat.js';

vi.mock('../api/db/db-connect.js', () => ({
  __esModule: true,
  default: async () => {},
}));

vi.mock('../middleware/auth.js', () => ({
  withProtection: (handler) => handler,
  authMiddleware: (handler) => handler,
  adminMiddleware: (handler) => handler,
  partnerOrAdminMiddleware: (handler) => handler,
}));

const mockRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn(),
});

function mockAggregateRows(rows) {
  ChatModel.Chat.aggregate = vi.fn().mockReturnValue({
    allowDiskUse: vi.fn().mockReturnValue(Promise.resolve(rows)),
  });
}

const baseReq = {
  method: 'GET',
  query: {
    startDate: '2026-01-07T00:00:00.000Z',
    endDate: '2026-01-14T00:00:00.000Z',
  },
};

const pipelineOf = () => ChatModel.Chat.aggregate.mock.calls[0][0];
const answersLookups = (pipeline) =>
  pipeline.filter((s) => s.$lookup && s.$lookup.from === 'answers');

describe('metrics-programs', () => {
  beforeEach(() => {
    mockAggregateRows([]);
  });

  it('maps grouped rows to { program, count, en, fr, programFr } with the curated French name', async () => {
    mockAggregateRows([
      { _id: 'GST/HST', total: 12, en: 10, fr: 2 },
      { _id: 'Canada Carbon Rebate', total: 5, en: 5, fr: 0 },
      { _id: 'unknown', total: 3, en: 1, fr: 2 },
    ]);

    const res = mockRes();
    await programHandler(baseReq, res);

    const { topPrograms } = res.json.mock.calls[0][0].metrics;
    expect(topPrograms).toEqual([
      // Curated CRA program → French name attached.
      { program: 'GST/HST', count: 12, en: 10, fr: 2, programFr: 'TPS/TVH' },
      // Emergent/unmapped name → empty programFr (English fallback at display).
      { program: 'Canada Carbon Rebate', count: 5, en: 5, fr: 0, programFr: '' },
      { program: 'unknown', count: 3, en: 1, fr: 2, programFr: '' },
    ]);
  });

  it('defaults the language split to 0 when the group returns no en/fr counts', async () => {
    // Guards the client subtitle/tooltip against undefined arithmetic if a row
    // ever comes back without the language fields (e.g. a legacy cached shape).
    mockAggregateRows([{ _id: 'GST/HST', total: 12 }]);

    const res = mockRes();
    await programHandler(baseReq, res);

    expect(res.json.mock.calls[0][0].metrics.topPrograms).toEqual([
      { program: 'GST/HST', count: 12, en: 0, fr: 0, programFr: 'TPS/TVH' },
    ]);
  });

  it('splits each program group by pageLanguage', async () => {
    await programHandler(baseReq, mockRes());
    const pipeline = pipelineOf();

    // pageLanguage must survive the projection to be groupable...
    const projection = pipeline.find((s) => s.$project && s.$project.program === 1);
    expect(projection.$project.pageLanguage).toBe(1);

    // ...and the group counts it per language alongside the total.
    const group = pipeline.find((s) => s.$group && s.$group._id === '$program');
    expect(group.$group.total).toEqual({ $sum: 1 });
    expect(group.$group.en).toEqual({ $sum: { $cond: [{ $eq: ['$pageLanguage', 'en'] }, 1, 0] } });
    expect(group.$group.fr).toEqual({ $sum: { $cond: [{ $eq: ['$pageLanguage', 'fr'] }, 1, 0] } });
  });

  it('restricts to normal answers by excluding the non-normal types', async () => {
    await programHandler(baseReq, mockRes());
    const pipeline = pipelineOf();

    // The answer type is resolved via an answers lookup...
    expect(answersLookups(pipeline)).toHaveLength(1);
    // ...and a $match drops the non-normal answer types.
    const ninMatch = pipeline.find(
      (s) => s.$match && s.$match.answerType && Array.isArray(s.$match.answerType.$nin),
    );
    expect(ninMatch).toBeTruthy();
    expect(ninMatch.$match.answerType.$nin).toEqual(NON_NORMAL_ANSWER_TYPES);
  });

  it('applies a user answerType cross-filter without a second answers lookup', async () => {
    const req = { ...baseReq, query: { ...baseReq.query, answerType: 'normal' } };
    await programHandler(req, mockRes());
    const pipeline = pipelineOf();

    // answerType is already resolved, so the user filter reuses it — still one lookup.
    expect(answersLookups(pipeline)).toHaveLength(1);
    const userMatch = pipeline.find(
      (s) => s.$match && s.$match.answerType === 'normal',
    );
    expect(userMatch).toBeTruthy();
  });
});
