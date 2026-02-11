import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// Mock ChatWorkflowService before importing the BatchService so runBatch uses our stub
vi.mock('../src/services/ChatWorkflowService.js', () => ({
  ChatWorkflowService: {
    processResponse: vi.fn(async (chatId, userMessage) => {
      // Simulate a graph result that includes a server-assigned chatId
      return { answer: { answerType: 'final', text: 'ok' }, chatId: 'generated-chat-id' };
    })
  },
  ShortQueryValidation: class ShortQueryValidation extends Error {},
  RedactionError: class RedactionError extends Error {}
}));

// Mock AuthService.fetch used by upsertBatchItems to avoid network
vi.mock('../src/services/AuthService.js', () => ({
  default: {
    fetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
  },
}));

import BatchService from '../src/services/BatchService.js';

describe('BatchService.runBatch', () => {
  it('processes an entry and uses returned chatId from graph result', async () => {
    const entries = [{ originalData: { QUESTION: 'Hello' } }];
    const res = await BatchService.runBatch({ entries, batchId: 'b1', concurrency: 1 });
    expect(res).toBeDefined();
    expect(Array.isArray(res.results)).toBe(true);
    expect(res.results[0].result).toBeDefined();
    expect(res.results[0].chatId).toBe('generated-chat-id');
    expect(res.summary.total).toBe(1);
  });
});
