import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the EmbeddingService module used by IMVectorService.matchQuestions
vi.mock('../EmbeddingService.js', () => ({
  default: {
    formatQuestionsForEmbedding: (qs) => qs,
    createEmbeddingClient: () => ({
      embedDocuments: async (arr) => arr.map(() => [0.1, 0.2, 0.3]),
    }),
  },
}));

import IMVectorService from '../IMVectorService.js';

describe('IMVectorService', () => {
  let svc;

  beforeEach(() => {
    svc = new IMVectorService();
    // Avoid heavy initialize; we'll stub indexes and metadata directly
    svc.isInitialized = true;
    svc.qaMeta = new Map();
  });

  it('search() respects threshold and returns top-k ordered results', async () => {
    svc.qaDB = {
      query: async (vec, k) => [
        { document: { id: 'a' }, similarity: 0.9 },
        { document: { id: 'b' }, similarity: 0.6 },
        { document: { id: 'c' }, similarity: 0.4 },
      ],
    };
    svc.qaMeta.set('a', { interactionId: 'i1', expertFeedbackId: null });
    svc.qaMeta.set('b', { interactionId: 'i2', expertFeedbackId: null });
    svc.qaMeta.set('c', { interactionId: 'i3', expertFeedbackId: null });

    const out = await svc.search([0, 1, 2], 10, 'qa', { threshold: 0.5 });
    expect(Array.isArray(out)).toBe(true);
    // Should include only items >= threshold (0.9 and 0.6) and maintain order
    expect(out.map(x => x.id)).toEqual(['a', 'b']);
    expect(out[0].similarity).toBeGreaterThanOrEqual(out[1].similarity);
  });

  it('matchQuestions() promotes the first expert-feedback-backed result to the front', async () => {
    // Make questionsDB present so matchQuestions will choose it
    svc.questionsDB = {
      size: () => 1,
      query: async (emb, k) => [
        { document: { id: 'p' }, similarity: 0.95 },
        { document: { id: 'q' }, similarity: 0.9 },
        { document: { id: 'r' }, similarity: 0.85 },
      ],
    };

    // Mark 'q' as having expert feedback
    svc.qaMeta.set('p', { interactionId: 'i10', expertFeedbackId: null });
    svc.qaMeta.set('q', { interactionId: 'i11', expertFeedbackId: 'ef-1' });
    svc.qaMeta.set('r', { interactionId: 'i12', expertFeedbackId: null });

    const resultsPerQuestion = await svc.matchQuestions(['why is x'], { provider: 'openai', k: 3 });
    expect(Array.isArray(resultsPerQuestion)).toBe(true);
    expect(resultsPerQuestion.length).toBe(1);
    const mapped = resultsPerQuestion[0];
    // The first item should be the expert-feedback-backed id 'q'
    expect(mapped[0].id).toBe('q');
    // The rest should be present and length <= k
    expect(mapped.length).toBeGreaterThanOrEqual(1);
    expect(mapped.length).toBeLessThanOrEqual(3);
  });
});
