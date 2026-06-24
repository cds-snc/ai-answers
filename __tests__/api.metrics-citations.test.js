import { describe, it, expect, vi, beforeEach } from 'vitest';
import citationHandler from '../api/metrics/metrics-citations.js';
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

describe('metrics-citations', () => {
  beforeEach(() => {
    mockAggregateRows([]);
  });

  it('ranks citation pages by question count and merges normalized variants', async () => {
    mockAggregateRows([
      { _id: { answerType: 'normal', url: 'https://www.canada.ca/en/taxes.html?x=1' }, count: 20 },
      { _id: { answerType: 'normal', url: 'http://canada.ca/en/taxes.html/' }, count: 5 },
      { _id: { answerType: 'normal', url: 'https://canada.ca/en/ei.html' }, count: 30 },
    ]);

    const res = mockRes();
    await citationHandler(baseReq, res);

    const { topCitations } = res.json.mock.calls[0][0].metrics;
    expect(topCitations).toEqual([
      { url: 'canada.ca/en/ei.html', count: 30 },
      { url: 'canada.ca/en/taxes.html', count: 25 },
    ]);
  });

  it('builds the answer-type breakdown across all four types and ignores unknown types', async () => {
    mockAggregateRows([
      { _id: { answerType: 'normal', url: 'https://canada.ca/en/a.html' }, count: 10 },
      { _id: { answerType: 'clarifying-question', url: '' }, count: 4 },
      { _id: { answerType: 'pt-muni', url: '' }, count: 3 },
      { _id: { answerType: 'not-gc', url: '' }, count: 2 },
      { _id: { answerType: '', url: '' }, count: 9 }, // legacy/unknown — ignored in breakdown
    ]);

    const res = mockRes();
    await citationHandler(baseReq, res);

    const { answerTypeBreakdown } = res.json.mock.calls[0][0].metrics;
    expect(answerTypeBreakdown).toEqual({
      normal: 10,
      'clarifying-question': 4,
      'pt-muni': 3,
      'not-gc': 2,
    });
  });

  it('omits answers with no citation URL from the citation list', async () => {
    mockAggregateRows([
      { _id: { answerType: 'normal', url: '' }, count: 50 },
      { _id: { answerType: 'normal', url: 'https://canada.ca/en/real.html' }, count: 7 },
    ]);

    const res = mockRes();
    await citationHandler(baseReq, res);

    const { topCitations, answerTypeBreakdown } = res.json.mock.calls[0][0].metrics;
    expect(topCitations).toEqual([{ url: 'canada.ca/en/real.html', count: 7 }]);
    // The url-less normal answers still count toward the answer-type total.
    expect(answerTypeBreakdown.normal).toBe(57);
  });

  it('looks up answers and citations and groups by (answerType, url)', async () => {
    await citationHandler(baseReq, mockRes());
    const pipeline = ChatModel.Chat.aggregate.mock.calls[0][0];
    const lookups = pipeline.filter((s) => s.$lookup).map((s) => s.$lookup.from);
    expect(lookups).toContain('answers');
    expect(lookups).toContain('citations');

    const group = pipeline.find((s) => s.$group);
    expect(group.$group._id).toHaveProperty('answerType');
    expect(group.$group._id).toHaveProperty('url');
  });

  it('skips the context lookup unless a department is selected', async () => {
    await citationHandler(baseReq, mockRes());
    let lookups = ChatModel.Chat.aggregate.mock.calls[0][0].filter((s) => s.$lookup).map((s) => s.$lookup.from);
    expect(lookups).not.toContain('contexts');

    const req = { ...baseReq, query: { ...baseReq.query, department: 'CRA-ARC' } };
    await citationHandler(req, mockRes());
    lookups = ChatModel.Chat.aggregate.mock.calls[1][0].filter((s) => s.$lookup).map((s) => s.$lookup.from);
    expect(lookups).toContain('contexts');
  });
});
