import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the EmbeddingService module used by IMVectorService.matchQuestions
vi.mock('../EmbeddingService.js', () => ({
  default: {
    formatQuestionsForEmbedding: (qs) => qs,
    buildQuestionsEmbeddingText: (qs) => Array.isArray(qs) ? qs.join('\n') : '',
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

  it('matchQuestions() returns results in similarity order without promoting expert-feedback hits', async () => {
    // Make questionsDB present so matchQuestions will choose it
    svc.questionsDB = {
      size: () => 1,
      query: async (emb, k) => [
        { document: { id: 'p' }, similarity: 0.95 },
        { document: { id: 'q' }, similarity: 0.9 },
        { document: { id: 'r' }, similarity: 0.85 },
      ],
    };

    // 'q' has expert feedback but is NOT the most similar — it must not be hoisted.
    svc.qaMeta.set('p', { interactionId: 'i10', expertFeedbackId: null });
    svc.qaMeta.set('q', { interactionId: 'i11', expertFeedbackId: 'ef-1', expertFeedbackScore: 100 });
    svc.qaMeta.set('r', { interactionId: 'i12', expertFeedbackId: null });

    const resultsPerQuestion = await svc.matchQuestions(['why is x'], { provider: 'openai', k: 3 });
    expect(Array.isArray(resultsPerQuestion)).toBe(true);
    expect(resultsPerQuestion.length).toBe(1);
    const mapped = resultsPerQuestion[0];
    // Order is by similarity desc: p (0.95), q (0.9), r (0.85) — no promotion of 'q'.
    expect(mapped.map(m => m.id)).toEqual(['p', 'q', 'r']);
  });

  it('matchQuestions() drops candidates below the similarity threshold', async () => {
    svc.questionsDB = {
      size: () => 1,
      query: async (emb, k) => [
        { document: { id: 'p' }, similarity: 0.95 },
        { document: { id: 'q' }, similarity: 0.9 },
        { document: { id: 'r' }, similarity: 0.85 },
      ],
    };
    svc.qaMeta.set('p', { interactionId: 'i10', expertFeedbackId: null });
    svc.qaMeta.set('q', { interactionId: 'i11', expertFeedbackId: null });
    svc.qaMeta.set('r', { interactionId: 'i12', expertFeedbackId: null });

    const resultsPerQuestion = await svc.matchQuestions(['why is x'], { provider: 'openai', k: 3, threshold: 0.88 });
    const mapped = resultsPerQuestion[0];
    // Only p (0.95) and q (0.9) clear the 0.88 floor; r (0.85) is dropped.
    expect(mapped.map(m => m.id)).toEqual(['p', 'q']);
  });

  it('matchQuestions() applies no similarity floor when threshold is null', async () => {
    svc.questionsDB = {
      size: () => 1,
      query: async (emb, k) => [
        { document: { id: 'p' }, similarity: 0.95 },
        { document: { id: 'q' }, similarity: 0.2 },
      ],
    };
    svc.qaMeta.set('p', { interactionId: 'i10', expertFeedbackId: null });
    svc.qaMeta.set('q', { interactionId: 'i11', expertFeedbackId: null });

    const resultsPerQuestion = await svc.matchQuestions(['why is x'], { provider: 'openai', k: 3, threshold: null });
    const mapped = resultsPerQuestion[0];
    // threshold null = short-circuit caller behaviour: keep everything.
    expect(mapped.map(m => m.id)).toEqual(['p', 'q']);
  });

  it('filters by denormalized feedback freshness before selecting the top results', async () => {
    const query = vi.fn().mockResolvedValue([
      { document: { id: 'stale' }, similarity: 0.99 },
      { document: { id: 'fresh' }, similarity: 0.95 },
      { document: { id: 'never-stale' }, similarity: 0.9 },
    ]);
    svc.questionsDB = { size: () => 3, query };
    svc.qaMeta.set('stale', {
      interactionId: 'i1',
      expertFeedbackId: 'ef-1',
      expertFeedbackCreatedAt: new Date(Date.now() - (366 * 24 * 60 * 60 * 1000)),
      expertFeedbackNeverStale: false,
    });
    svc.qaMeta.set('fresh', {
      interactionId: 'i2',
      expertFeedbackId: 'ef-2',
      expertFeedbackCreatedAt: new Date(),
      expertFeedbackNeverStale: false,
    });
    svc.qaMeta.set('never-stale', {
      interactionId: 'i3',
      expertFeedbackId: 'ef-3',
      expertFeedbackCreatedAt: new Date(Date.now() - (366 * 24 * 60 * 60 * 1000)),
      expertFeedbackNeverStale: true,
    });

    const [matches] = await svc.matchQuestions(['why is x'], {
      provider: 'openai',
      k: 2,
      recencyDays: 365,
      useDenormalizedPreFilter: true,
    });

    expect(query).toHaveBeenCalledWith(expect.any(Array), 3);
    expect(matches.map(match => match.id)).toEqual(['fresh', 'never-stale']);
  });
});
