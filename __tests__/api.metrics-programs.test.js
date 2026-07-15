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

  it('maps grouped rows to { program, count }', async () => {
    mockAggregateRows([
      { _id: 'Canada Pension Plan', total: 12 },
      { _id: 'unknown', total: 5 },
    ]);

    const res = mockRes();
    await programHandler(baseReq, res);

    const { topPrograms } = res.json.mock.calls[0][0].metrics;
    expect(topPrograms).toEqual([
      { program: 'Canada Pension Plan', count: 12 },
      { program: 'unknown', count: 5 },
    ]);
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
