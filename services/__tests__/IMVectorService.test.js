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

  it('breaks equal similarity ties with the latest expert feedback', async () => {
    svc.questionsDB = {
      size: () => 2,
      query: async () => [
        { document: { id: 'older' }, similarity: 0.9 },
        { document: { id: 'newer' }, similarity: 0.9 },
      ],
    };
    svc.qaMeta.set('older', { interactionId: 'i1', expertFeedbackId: 'ef-1', expertFeedbackCreatedAt: new Date('2026-01-01') });
    svc.qaMeta.set('newer', { interactionId: 'i2', expertFeedbackId: 'ef-2', expertFeedbackCreatedAt: new Date('2026-02-01') });

    const [matches] = await svc.matchQuestions(['why is x'], { provider: 'openai', k: 2 });

    expect(matches.map((match) => match.id)).toEqual(['newer', 'older']);
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

describe('IMVectorService.updateExpertFeedbackMetadata', () => {
  let svc;

  beforeEach(() => {
    svc = new IMVectorService();
    svc.qaDB = { del: vi.fn() };
    svc.questionsDB = { del: vi.fn() };
    svc.sentenceDB = { del: vi.fn() };
    svc._addMeta('qa', 'qa1', { interactionId: 'i1', expertFeedbackId: 'ef1', expertFeedbackScore: 100, expertFeedbackNeverStale: false });
    svc._addMeta('questions', 'qa1:q', { interactionId: 'i1', expertFeedbackId: 'ef1', expertFeedbackScore: 100, expertFeedbackNeverStale: false });
    svc._addMeta('qa', 'qa2', { interactionId: 'i2', expertFeedbackId: 'ef2', expertFeedbackScore: 100, expertFeedbackNeverStale: false });
    svc._addMeta('sentences', 's1', { interactionId: 'i1', sentenceIndex: 0, expertFeedbackId: 'ef1', expertFeedbackScore: 100 });
    svc.stats.embeddings = 2;
    svc.stats.questions = 1;
    svc.stats.sentences = 1;
  });

  it("updates an edited evaluation's score and never-stale flag in place, without adding entries", () => {
    svc.updateExpertFeedbackMetadata('i1', { _id: 'ef1', totalScore: 0, neverStale: true });

    expect(svc.qaMeta.size).toBe(3);
    expect(svc.qaMeta.get('qa1')).toMatchObject({ expertFeedbackScore: 0, expertFeedbackNeverStale: true });
    expect(svc.qaMeta.get('qa1:q')).toMatchObject({ expertFeedbackScore: 0, expertFeedbackNeverStale: true });
    expect(svc.sentMeta.get('s1')).toMatchObject({ expertFeedbackScore: 0 });
    expect(svc.qaMeta.get('qa2').expertFeedbackScore).toBe(100);
  });

  it("drops a deleted evaluation's entries from the search", () => {
    svc.updateExpertFeedbackMetadata('i1', null);

    expect([...svc.qaMeta.keys()]).toEqual(['qa2']);
    expect(svc.sentMeta.size).toBe(0);
    expect(svc.qaDB.del).toHaveBeenCalledWith({ id: 'qa1' });
    expect(svc.questionsDB.del).toHaveBeenCalledWith({ id: 'qa1:q' });
    expect(svc.sentenceDB.del).toHaveBeenCalledWith({ id: 's1' });
    // Each entry only from its own index, and the counts follow.
    expect(svc.qaDB.del).not.toHaveBeenCalledWith({ id: 'qa1:q' });
    expect(svc.questionsDB.del).not.toHaveBeenCalledWith({ id: 'qa1' });
    expect(svc.stats).toMatchObject({ embeddings: 1, questions: 0, sentences: 0 });
    expect(svc.idsByInteraction.qa.has('i1')).toBe(false);
    expect(svc.idsByInteraction.qa.get('i2')).toEqual(new Set(['qa2']));
  });

  it('finds entries added at runtime too', () => {
    svc.qaDB.add = vi.fn();
    svc.addExpertFeedbackEmbedding({ interactionId: 'i3', expertFeedbackId: 'ef3', expertFeedbackTotalScore: 100, questionsAnswerEmbedding: [0.1, 0.2] });
    svc.updateExpertFeedbackMetadata('i3', { _id: 'ef3', totalScore: 20 });

    const [entry] = [...svc.idsByInteraction.qa.get('i3')].map((id) => svc.qaMeta.get(id));
    expect(entry.expertFeedbackScore).toBe(20);
  });

  it("drops an AI evaluation's entries instead of copying its score (AGENTS.md)", () => {
    svc.updateExpertFeedbackMetadata('i1', { _id: 'ef1', type: ' AI ', totalScore: 100, neverStale: true });

    expect([...svc.qaMeta.keys()]).toEqual(['qa2']);
    expect(svc.sentMeta.size).toBe(0);
    expect(svc.qaDB.del).toHaveBeenCalledWith({ id: 'qa1' });
  });
});
