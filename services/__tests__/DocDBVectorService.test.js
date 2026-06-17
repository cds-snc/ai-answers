import { describe, it, expect, vi, beforeEach } from 'vitest';
import DocDBVectorService from '../DocDBVectorService.js';

const mockEmbedDocuments = vi.fn();

vi.mock('../EmbeddingService.js', () => ({
  default: {
    formatQuestionsForEmbedding: vi.fn((questions) => questions.join('\n')),
    buildQuestionsEmbeddingText: vi.fn((questions) => questions.join('\n')),
    createEmbeddingClient: vi.fn(() => ({
      embedDocuments: mockEmbedDocuments,
    })),
  },
}));

vi.mock('../ServerLoggingService.js', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('DocDBVectorService', () => {
  let service;
  let aggregate;
  let capturedPipeline;

  beforeEach(() => {
    capturedPipeline = null;
    mockEmbedDocuments.mockResolvedValue([[0.1, 0.2, 0.3]]);
    aggregate = vi.fn((pipeline) => {
      capturedPipeline = pipeline;
      return { toArray: vi.fn().mockResolvedValue([]) };
    });
    service = new DocDBVectorService();
    service.isInitialized = true;
    service.collection = { aggregate };
  });

  it('does not apply an English language filter when no language is supplied', async () => {
    await service.matchQuestions(['same question'], {
      k: 5,
      expertFeedbackRating: 100,
    });

    expect(capturedPipeline).toBeTruthy();
    expect(capturedPipeline).not.toContainEqual({ $match: { 'chat.pageLanguage': 'en' } });
  });

  it('uses a larger vector candidate pool before post-search filters', async () => {
    await service.matchQuestions(['same question'], {
      k: 5,
      expertFeedbackRating: 100,
      language: 'en',
    });

    expect(capturedPipeline[0].$search.vectorSearch.k).toBe(100);
    expect(capturedPipeline[1].$limit).toBe(100);
    expect(capturedPipeline).toContainEqual({ $match: { 'chat.pageLanguage': 'en' } });
  });

  it('uses denormalized metadata filters before vector search when requested', async () => {
    await service.matchQuestions(['same question'], {
      k: 5,
      expertFeedbackRating: 100,
      expertFeedbackComparison: 'lte',
      language: 'en',
      recencyDays: 365,
      useDenormalizedPreFilter: true,
    });

    expect(capturedPipeline[0]).toMatchObject({
      $match: {
        expertFeedbackId: { $exists: true, $ne: null },
        expertFeedbackTotalScore: { $lte: 100 },
        pageLanguage: 'en',
      },
    });
    expect(capturedPipeline[0].$match.$or).toHaveLength(2);
    expect(capturedPipeline[1].$search.vectorSearch.path).toBe('questionsEmbedding');
    expect(capturedPipeline[1].$search.vectorSearch.k).toBe(25);
    expect(capturedPipeline.some((stage) => stage.$lookup)).toBe(false);
  });

  it('returns separate embedding group counts in stats', async () => {
    const collectionCounts = {
      questionsAnswerEmbedding: 25,
      questionEmbedding: 25,
      questionsEmbedding: 25,
      answerEmbedding: 25,
    };
    const countDocuments = vi.fn((query) => {
      const vectorField = Object.keys(collectionCounts).find((field) => query[field]);
      return Promise.resolve(vectorField ? collectionCounts[vectorField] : 0);
    });
    const find = vi.fn(() => ({
      project: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([{ _id: 'embedding-1' }]),
      })),
    }));
    const sentenceCountDocuments = vi.fn().mockResolvedValue(69);

    service.collection = { aggregate, countDocuments, find };
    service.sentenceCollection = { countDocuments: sentenceCountDocuments };
    vi.spyOn(service, 'initialize').mockResolvedValue();

    const mongoose = await import('mongoose');
    vi.spyOn(mongoose.default.connection, 'collection').mockReturnValue({
      find: vi.fn(() => ({
        project: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([{ _id: 'interaction-1' }]),
        })),
      })),
    });

    const stats = await service.getStats();

    expect(stats.embeddings).toBe(25);
    expect(stats.questionEmbeddings).toBe(25);
    expect(stats.questionsEmbeddings).toBe(25);
    expect(stats.answerEmbeddings).toBe(25);
    expect(stats.sentences).toBe(69);
  });

  it('re-scores candidates, returns them in similarity order, and does not promote expert-feedback hits', async () => {
    mockEmbedDocuments.mockResolvedValue([[1, 0]]);
    const docs = [
      { _id: 'a', interactionId: 'ia', expertFeedbackId: null, questionsEmbedding: [1, 0] },
      { _id: 'b', interactionId: 'ib', expertFeedbackId: 'ef-b', questionsEmbedding: [0.7071067811865476, 0.7071067811865476] },
      { _id: 'c', interactionId: 'ic', expertFeedbackId: null, questionsEmbedding: [0, 1] },
    ];
    service.collection = { aggregate: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(docs) })) };

    const out = await service.matchQuestions(['q'], { k: 3 });
    // similarity desc: a (1.0), b (~0.707), c (0). Rated hit 'b' is NOT hoisted to the front.
    expect(out[0].map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(out[0][0].similarity).toBeCloseTo(1, 5);
  });

  it('drops candidates below the similarity threshold', async () => {
    mockEmbedDocuments.mockResolvedValue([[1, 0]]);
    const docs = [
      { _id: 'a', interactionId: 'ia', expertFeedbackId: null, questionsEmbedding: [1, 0] },
      { _id: 'b', interactionId: 'ib', expertFeedbackId: null, questionsEmbedding: [0.7071067811865476, 0.7071067811865476] },
      { _id: 'c', interactionId: 'ic', expertFeedbackId: null, questionsEmbedding: [0, 1] },
    ];
    service.collection = { aggregate: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(docs) })) };

    const out = await service.matchQuestions(['q'], { k: 3, threshold: 0.5 });
    // a (1.0) and b (~0.707) clear the 0.5 floor; c (0) is dropped.
    expect(out[0].map((r) => r.id)).toEqual(['a', 'b']);
  });
});
