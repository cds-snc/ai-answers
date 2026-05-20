import { describe, it, expect, vi, beforeEach } from 'vitest';
import DocDBVectorService from '../DocDBVectorService.js';

const mockEmbedDocuments = vi.fn();

vi.mock('../EmbeddingService.js', () => ({
  default: {
    formatQuestionsForEmbedding: vi.fn((questions) => questions.join('\n')),
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
});
