import mongoose from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../middleware/auth.js', () => ({
  withProtection: (handler) => handler,
  authMiddleware: (handler) => handler,
  adminMiddleware: (handler) => handler,
}));

vi.mock('../../db/db-connect.js', () => ({
  default: vi.fn().mockResolvedValue(),
}));

const queryVector = [1, 0];

const docs = {
  vectorOnly: [
    { _id: 'vec-a', interactionId: 'ia', questionsEmbedding: [1, 0] },
    { _id: 'vec-b', interactionId: 'ib', questionsEmbedding: [0.9, 0.1] },
    { _id: 'vec-c', interactionId: 'ic', questionsEmbedding: [0, 1] },
    { _id: 'vec-d', interactionId: 'id', questionsEmbedding: [0.7, 0.7] },
  ],
  annFiltered: [
    { _id: 'vec-a', interactionId: 'ia', expertFeedbackId: 'ef-a', questionsEmbedding: [1, 0] },
    { _id: 'vec-b', interactionId: 'ib', expertFeedbackId: 'ef-b', questionsEmbedding: [0.9, 0.1] },
  ],
  exactFiltered: [
    { _id: 'vec-a', interactionId: 'ia', expertFeedbackId: 'ef-a', questionsEmbedding: [1, 0] },
    { _id: 'vec-b', interactionId: 'ib', expertFeedbackId: 'ef-b', questionsEmbedding: [0.9, 0.1] },
  ],
  denormalized: [
    {
      _id: 'vec-a',
      interactionId: 'ia',
      expertFeedbackId: 'ef-a',
      expertFeedbackTotalScore: 100,
      pageLanguage: 'en',
      questionsEmbedding: [1, 0],
    },
    {
      _id: 'vec-b',
      interactionId: 'ib',
      expertFeedbackId: 'ef-b',
      expertFeedbackTotalScore: 90,
      pageLanguage: 'en',
      questionsEmbedding: [0.9, 0.1],
    },
  ],
  feedbackCollection: [
    {
      _id: 'feedback-a',
      sourceEmbeddingId: 'vec-a',
      interactionId: 'ia',
      expertFeedbackId: 'ef-a',
      expertFeedbackTotalScore: 100,
      pageLanguage: 'en',
      questionsEmbedding: [1, 0],
    },
    {
      _id: 'feedback-b',
      sourceEmbeddingId: 'vec-b',
      interactionId: 'ib',
      expertFeedbackId: 'ef-b',
      expertFeedbackTotalScore: 90,
      pageLanguage: 'en',
      questionsEmbedding: [0.9, 0.1],
    },
  ],
  baseline: [
    { _id: 'vec-a', interactionId: 'ia', expertFeedbackId: 'ef-a', questionsEmbedding: [1, 0] },
    { _id: 'vec-b', interactionId: 'ib', expertFeedbackId: 'ef-b', questionsEmbedding: [0.9, 0.1] },
    { _id: 'vec-c', interactionId: 'ic', expertFeedbackId: null, questionsEmbedding: [0, 1] },
  ],
};

function makeAggregateResult(resultDocs) {
  return {
    toArray: vi.fn().mockResolvedValue(resultDocs),
  };
}

function createEmbeddingsAggregate(findOneHasDenormFields = true) {
  const aggregate = vi.fn((pipeline) => {
    const hasCount = pipeline.some((stage) => stage.$count);
    if (hasCount) {
      return makeAggregateResult([{ count: 2 }]);
    }

    const hasVectorSearch = pipeline.some((stage) => stage.$vectorSearch);
    const hasLookup = pipeline.some((stage) => stage.$lookup?.from === 'interactions');
    const hasExpertFeedbackMatch = pipeline.some((stage) => stage.$match?.['inter.expertFeedback']);
    const hasHasExpertFeedbackMatch = pipeline.some((stage) => stage.$match?.hasExpertFeedback === true);
    const hasBaselineMatch = pipeline.some((stage) => stage.$match?.questionsEmbedding?.$exists === true);
    const exactStage = pipeline.find((stage) => stage.$vectorSearch)?.$vectorSearch?.exact === true;
    const hasLimit = pipeline.some((stage) => stage.$limit === 10);

    if (hasVectorSearch && hasLookup && hasExpertFeedbackMatch && hasLimit) {
      return makeAggregateResult(docs.annFiltered);
    }

    if (hasVectorSearch && hasLookup && exactStage) {
      return makeAggregateResult(docs.exactFiltered);
    }

    if (hasVectorSearch && hasHasExpertFeedbackMatch && exactStage) {
      return makeAggregateResult(findOneHasDenormFields ? docs.denormalized : []);
    }

    if (hasVectorSearch && !hasLookup && !hasHasExpertFeedbackMatch) {
      return makeAggregateResult(docs.vectorOnly);
    }

    if (hasLookup && !hasVectorSearch && hasBaselineMatch) {
      return makeAggregateResult(docs.baseline);
    }

    return makeAggregateResult([]);
  });

  return aggregate;
}

function createFeedbackCollectionAggregate() {
  return vi.fn((pipeline) => {
    const hasVectorSearch = pipeline.some((stage) => stage.$vectorSearch);
    if (hasVectorSearch) {
      return makeAggregateResult(docs.feedbackCollection);
    }
    return makeAggregateResult([]);
  });
}

function createDbMock({
  feedbackCollectionExists = true,
  denormFieldsPresent = true,
  interactionsCountFails = false,
} = {}) {
  const embeddings = {
    findOne: vi.fn((query, options) => {
      if (options?.projection?.questionsEmbedding) {
        return Promise.resolve({ _id: 'sample-embedding', questionsEmbedding: queryVector });
      }

      if (denormFieldsPresent && options?.projection?.hasExpertFeedback) {
        return Promise.resolve({
          _id: 'denorm-sample',
          hasExpertFeedback: true,
          expertFeedbackId: 'ef-sample',
          expertFeedbackTotalScore: 100,
          pageLanguage: 'en',
        });
      }

      return Promise.resolve(null);
    }),
    countDocuments: vi.fn(() => Promise.resolve(4)),
    aggregate: createEmbeddingsAggregate(denormFieldsPresent),
  };

  const interactions = {
    countDocuments: vi.fn(() => (
      interactionsCountFails
        ? Promise.reject(new Error('interactions count failed'))
        : Promise.resolve(2)
    )),
  };

  const feedbackEmbeddings = {
    countDocuments: vi.fn(() => Promise.resolve(2)),
    aggregate: createFeedbackCollectionAggregate(),
  };

  const db = {
    collection: vi.fn((name) => {
      if (name === 'embeddings') return embeddings;
      if (name === 'interactions') return interactions;
      if (name === 'feedback_embeddings') return feedbackEmbeddings;
      throw new Error(`Unexpected collection ${name}`);
    }),
    listCollections: vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue(feedbackCollectionExists ? [{ name: 'feedback_embeddings' }] : []),
    })),
  };

  return { db, embeddings, interactions, feedbackEmbeddings };
}

describe('vector docdb8 capability probe', () => {
  let module;
  let dbMock;

  afterEach(() => {
    try {
      delete mongoose.connection.db;
    } catch {
      // ignore cleanup failures in tests
    }
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    vi.resetModules();
    dbMock = createDbMock();
    Object.defineProperty(mongoose.connection, 'db', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: dbMock.db,
    });
    module = await import('../vector-docdb8-capability-test.js');
  });

  it('chooses the right recommendation helper and recall math', () => {
    expect(module.recallAtK(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(2 / 3, 5);
    expect(module.getRecommendation({
      annPostFilter: { durationMs: 30 },
      exactAfterFeedbackLookup: { durationMs: 20, supported: true },
      exactAfterDenormalizedMatch: { durationMs: 18, supported: true },
      feedbackCollectionAnn: { durationMs: 12, supported: true },
    })).toBe('dedicatedFeedbackCollection');
    expect(module.getRecommendation({
      annPostFilter: { durationMs: 30 },
      exactAfterFeedbackLookup: { durationMs: 20, supported: true },
      exactAfterDenormalizedMatch: { durationMs: 18, supported: true },
      feedbackCollectionAnn: { durationMs: 40, supported: true },
    })).toBe('denormalizedPreFilter');
    expect(module.getRecommendation({
      annPostFilter: { durationMs: 30 },
      exactAfterFeedbackLookup: { durationMs: 10, supported: true },
      exactAfterDenormalizedMatch: { durationMs: 40, supported: true },
      feedbackCollectionAnn: { durationMs: 40, supported: true },
    })).toBe('lookupPreFilter');
    expect(module.getRecommendation({
      annPostFilter: { durationMs: 15 },
      exactAfterFeedbackLookup: { durationMs: 20, supported: true },
      exactAfterDenormalizedMatch: { durationMs: 25, supported: true },
      feedbackCollectionAnn: { durationMs: 40, supported: true },
    })).toBe('annPostFilter');
  });

  it('returns the new benchmark groups, recall comparisons, and warnings', async () => {
    const result = await module.buildCapabilityResult();

    expect(result.available).toBe(true);
    expect(result.capabilities.vectorSearchScoreSupport).toBe(false);
    expect(result.tests.ann_all_then_feedback_post_filter).toBeTruthy();
    expect(result.tests.exact_after_feedback_lookup_match).toBeTruthy();
    expect(result.tests.exact_after_denormalized_match).toBeTruthy();
    expect(result.tests.ann_feedback_only_collection).toBeTruthy();
    expect(result.tests.node_bruteforce_feedback_subset).toBeTruthy();
    expect(result.benchmarks.ann_all_then_feedback_post_filter).toHaveLength(1);
    expect(result.recallComparisons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strategy: 'exact_after_denormalized_match',
          recallAtK: 2 / 3,
        }),
      ])
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('vectorSearchScore'),
      ])
    );
    expect(typeof result.recommendation).toBe('string');
    expect(result.tests.vectorSearchThenFeedbackFilter.metadata.candidateReductionBeforeVectorSearch).toBe(false);
    expect(result.tests.feedbackFilterBeforeVectorSearch.metadata.vectorSearchStage).toBe('afterFeedbackLookupAndMatch');
  });

  it('runs a single probe when requested', async () => {
    const result = await module.buildCapabilityProbeResult('ann_all_then_feedback_post_filter');

    expect(result.available).toBe(true);
    expect(result.probe).toBe('ann_all_then_feedback_post_filter');
    expect(result.test).toMatchObject({
      strategy: 'ann_all_then_feedback_post_filter',
      supported: true,
    });
    expect(typeof result.test.durationMs).toBe('number');
    expect(result.test.metadata.candidateLimit).toBe(100);
  });

  it('keeps going when a supporting count query fails', async () => {
    dbMock = createDbMock({ interactionsCountFails: true });
    Object.defineProperty(mongoose.connection, 'db', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: dbMock.db,
    });
    module = await import('../vector-docdb8-capability-test.js');

    const result = await module.buildCapabilityResult();

    expect(result.available).toBe(true);
    expect(result.counts.interactionsWithFeedback).toBe(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Interactions with feedback count failed'),
      ])
    );
  });

  it('skips the denormalized exact-search benchmark when the fields are absent', async () => {
    dbMock = createDbMock({ denormFieldsPresent: false, feedbackCollectionExists: false });
    Object.defineProperty(mongoose.connection, 'db', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: dbMock.db,
    });
    module = await import('../vector-docdb8-capability-test.js');

    const result = await module.buildCapabilityResult();

    expect(result.tests.exact_after_denormalized_match.skipped).toBe(true);
    expect(result.tests.ann_feedback_only_collection.skipped).toBe(true);
    expect(result.tests.exact_after_denormalized_match.metadata.reason).toContain('denormalized expert feedback fields are not present on embeddings');
  });
});
