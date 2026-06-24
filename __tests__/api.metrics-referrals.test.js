import { describe, it, expect, vi, beforeEach } from 'vitest';
import referralHandler from '../api/metrics/metrics-referrals.js';
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

// Make Chat.aggregate(...).allowDiskUse() resolve to the given raw rows.
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

describe('metrics-referrals', () => {
  beforeEach(() => {
    mockAggregateRows([]);
  });

  it('normalizes and merges raw referrers, then ranks by merged count', async () => {
    // Two raw rows that normalize to the same page must merge into one row whose
    // count is the sum, and outrank a distinct page.
    mockAggregateRows([
      { _id: 'https://www.canada.ca/en/taxes.html?utm=x', count: 30 },
      { _id: 'http://canada.ca/en/taxes.html/', count: 25 },
      { _id: 'https://canada.ca/en/benefits.html', count: 40 },
    ]);

    const res = mockRes();
    await referralHandler(baseReq, res);

    const { topReferrals } = res.json.mock.calls[0][0].metrics;
    expect(topReferrals).toEqual([
      { url: 'canada.ca/en/taxes.html', count: 55 },
      { url: 'canada.ca/en/benefits.html', count: 40 },
    ]);
  });

  it('drops blanks and AI Answers self-referrals', async () => {
    mockAggregateRows([
      { _id: 'https://ai-answers.alpha.canada.ca/en', count: 99 },
      { _id: '', count: 50 },
      { _id: 'https://canada.ca/en/real-page.html', count: 7 },
    ]);

    const res = mockRes();
    await referralHandler(baseReq, res);

    const { topReferrals } = res.json.mock.calls[0][0].metrics;
    expect(topReferrals).toEqual([{ url: 'canada.ca/en/real-page.html', count: 7 }]);
  });

  it('skips the context lookup when no department is selected', async () => {
    await referralHandler(baseReq, mockRes());
    const pipeline = ChatModel.Chat.aggregate.mock.calls[0][0];
    const lookups = pipeline.filter((s) => s.$lookup).map((s) => s.$lookup.from);
    expect(lookups).toContain('interactions');
    expect(lookups).not.toContain('contexts');
  });

  it('adds the context lookup + department match when a department is selected', async () => {
    const req = { ...baseReq, query: { ...baseReq.query, department: 'CRA-ARC' } };
    await referralHandler(req, mockRes());
    const pipeline = ChatModel.Chat.aggregate.mock.calls[0][0];
    const lookups = pipeline.filter((s) => s.$lookup).map((s) => s.$lookup.from);
    expect(lookups).toContain('contexts');
    // A $match referencing the looked-up department field must be present.
    const hasDeptMatch = pipeline.some(
      (s) => s.$match && JSON.stringify(s.$match).includes('department'),
    );
    expect(hasDeptMatch).toBe(true);
  });

  it('counts conversations once via the two-stage group (pair then count)', async () => {
    await referralHandler(baseReq, mockRes());
    const pipeline = ChatModel.Chat.aggregate.mock.calls[0][0];
    const groups = pipeline.filter((s) => s.$group);
    // First group collapses (url, chat) pairs; second counts pairs per url.
    expect(groups[0].$group._id).toHaveProperty('url');
    expect(groups[0].$group._id).toHaveProperty('chat');
    expect(groups[1].$group.count).toEqual({ $sum: 1 });
  });
});
