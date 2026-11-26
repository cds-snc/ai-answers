import { describe, it, expect, vi } from 'vitest';

// The chat date is only a pre-filter: an evaluation counts by its
// interaction's date. A chat that started just before the range must still
// reach the exact interactions.createdAt match.

vi.mock('../../api/db/db-connect.js', () => ({ default: vi.fn() }));
vi.mock('../../api/util/reviewer-filter.js', () => ({ resolveReviewerMatch: vi.fn(async () => null) }));
vi.mock('../../models/chat.js', () => {
  const aggregate = vi.fn(() => {
    const result = Promise.resolve([]);
    result.allowDiskUse = () => Promise.resolve([]);
    return result;
  });
  return { Chat: { aggregate } };
});
vi.mock('../../models/evalAnalysis.js', () => ({
  EvalAnalysis: {
    create: vi.fn(async (fields) => ({ ...fields, _id: 'a1', save: vi.fn(async () => {}) })),
    updateOne: vi.fn(async () => {})
  }
}));

import { Chat } from '../../models/chat.js';
import EvalAnalysisService from '../EvalAnalysisService.js';

describe('EvalAnalysisService pipeline dates', () => {
  it('pre-filters chats from one day before the start, then applies the exact range to interactions', async () => {
    await EvalAnalysisService.createAndSynthesize({
      filters: { department: 'CRA-ARC', startDate: '2026-10-02T00:00:00.000Z', endDate: '2026-10-31T23:59:59.999Z' }
    });
    const [pipeline] = Chat.aggregate.mock.calls[0];

    const chatMatch = pipeline[0].$match.createdAt;
    expect(chatMatch.$gte.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(chatMatch.$lte.toISOString()).toBe('2026-10-31T23:59:59.999Z');

    const interactionMatch = pipeline.find((stage) => stage.$match?.['interactions.createdAt']);
    expect(interactionMatch.$match['interactions.createdAt'].$gte.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(interactionMatch.$match['interactions.createdAt'].$lte.toISOString()).toBe('2026-10-31T23:59:59.999Z');
  });
});
