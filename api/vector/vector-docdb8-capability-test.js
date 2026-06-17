// api/vector/vector-docdb8-capability-test.js
import mongoose from 'mongoose';
import cosineSimilarity from 'compute-cosine-similarity';
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';
import dbConnect from '../db/db-connect.js';

const VECTOR_INDEX = 'questions_vector_index';
const FEEDBACK_VECTOR_INDEX = 'feedback_questions_vector_index';
const VECTOR_PATH = 'questionsEmbedding';
const FEEDBACK_COLLECTION = 'feedback_embeddings';
const BENCHMARK_RUNS = 3;
const TARGET_K = 10;
const ANN_POST_FILTER_CANDIDATE_LIMIT_VALUES = [TARGET_K * 5, TARGET_K * 10, TARGET_K * 20, TARGET_K * 50, TARGET_K * 100];
const ANN_POST_FILTER_NUM_CANDIDATES_VALUES = [100, 200, 500, 1000];
const FEEDBACK_ANN_NUM_CANDIDATES_VALUES = [50, 100, 200, 500];

const VECTOR_EXISTS_FILTER = {
  [VECTOR_PATH]: { $exists: true, $type: 'array', $not: { $size: 0 } },
};

function serializeValue(value) {
  return value?.toString?.() || value;
}

function median(values) {
  const numeric = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!numeric.length) {
    return null;
  }

  const middle = Math.floor(numeric.length / 2);
  if (numeric.length % 2 === 1) {
    return numeric[middle];
  }
  return (numeric[middle - 1] + numeric[middle]) / 2;
}

function cosineFromDoc(queryVector, doc, vectorField = VECTOR_PATH) {
  const candidateVector = doc?.[vectorField];
  if (!Array.isArray(queryVector) || !Array.isArray(candidateVector) || !candidateVector.length) {
    return null;
  }

  try {
    const score = cosineSimilarity(queryVector, candidateVector);
    return typeof score === 'number' && Number.isFinite(score) ? score : null;
  } catch {
    return null;
  }
}

function serializeResult(row) {
  return {
    _id: serializeValue(row._id),
    interactionId: serializeValue(row.interactionId),
    expertFeedbackId: serializeValue(row.expertFeedbackId),
    similarity: typeof row.similarity === 'number' && Number.isFinite(row.similarity) ? row.similarity : null,
  };
}

function summarizeScores(docs, queryVector, vectorField = VECTOR_PATH) {
  const scores = docs
    .map((doc) => cosineFromDoc(queryVector, doc, vectorField))
    .filter((score) => typeof score === 'number' && Number.isFinite(score));

  return {
    numericScoreCount: scores.length,
    hasNumericScores: scores.length > 0,
    minScore: scores.length ? Math.min(...scores) : null,
    maxScore: scores.length ? Math.max(...scores) : null,
  };
}

function serializeError(error) {
  return {
    message: error.message,
    code: error.code || null,
    codeName: error.codeName || null,
    stack: error.stack || null,
  };
}

function sortBySimilarityDesc(docs) {
  return [...docs].sort((a, b) => {
    const aScore = typeof a.similarity === 'number' && Number.isFinite(a.similarity) ? a.similarity : -Infinity;
    const bScore = typeof b.similarity === 'number' && Number.isFinite(b.similarity) ? b.similarity : -Infinity;
    return bScore - aScore;
  });
}

function buildScoredDocs(docs, queryVector, vectorField = VECTOR_PATH) {
  const scoredDocs = docs.map((doc) => ({
    ...doc,
    similarity: cosineFromDoc(queryVector, doc, vectorField),
  }));
  return sortBySimilarityDesc(scoredDocs);
}

function buildTopIds(docs, topK = TARGET_K) {
  return docs.slice(0, topK).map((doc) => serializeValue(doc._id));
}

function recallAtK(strategyTopIds, baselineTopIds) {
  const strategyIds = new Set((strategyTopIds || []).map((id) => String(id)));
  const baselineIds = (baselineTopIds || []).map((id) => String(id));
  if (!baselineIds.length) {
    return null;
  }

  const overlap = baselineIds.filter((id) => strategyIds.has(id)).length;
  return overlap / baselineIds.length;
}

function formatResult(queryVector, docs, vectorField = VECTOR_PATH, topK = TARGET_K) {
  const scoredDocs = buildScoredDocs(docs, queryVector, vectorField);
  const scoreSummary = summarizeScores(scoredDocs, queryVector, vectorField);

  return {
    resultCount: docs.length,
    finalResultCount: docs.length,
    sampleResults: scoredDocs.slice(0, 5).map(serializeResult),
    scoreSummary,
    localScoreMin: scoreSummary.minScore,
    localScoreMax: scoreSummary.maxScore,
    topIds: buildTopIds(scoredDocs, topK),
  };
}

async function runAggregateBenchmark(collection, name, pipeline, options = {}) {
  const {
    queryVector,
    vectorField = VECTOR_PATH,
    topK = TARGET_K,
    runs = BENCHMARK_RUNS,
    metadata = {},
  } = options;

  if (metadata.skipped) {
    return {
      name,
      strategy: name,
      supported: false,
      skipped: true,
      resultCount: 0,
      finalResultCount: 0,
      sampleResults: [],
      scoreSummary: {
        numericScoreCount: 0,
        hasNumericScores: false,
        minScore: null,
        maxScore: null,
      },
      localScoreMin: null,
      localScoreMax: null,
      topIds: [],
      durationMs: null,
      durationsMs: [],
      metadata,
      error: null,
    };
  }

  const durations = [];
  let docs = [];

  try {
    for (let i = 0; i < runs; i += 1) {
      const start = Date.now();
      docs = await collection.aggregate(pipeline).toArray();
      durations.push(Date.now() - start);
    }

    const scored = formatResult(queryVector, docs, vectorField, topK);
    return {
      name,
      strategy: name,
      supported: true,
      skipped: false,
      ...scored,
      durationMs: median(durations),
      durationsMs: durations,
      metadata,
      error: null,
    };
  } catch (error) {
    return {
      name,
      strategy: name,
      supported: false,
      skipped: false,
      resultCount: 0,
      finalResultCount: 0,
      sampleResults: [],
      scoreSummary: {
        numericScoreCount: 0,
        hasNumericScores: false,
        minScore: null,
        maxScore: null,
      },
      localScoreMin: null,
      localScoreMax: null,
      topIds: [],
      durationMs: median(durations),
      durationsMs: durations,
      metadata,
      error: serializeError(error),
    };
  }
}

async function runVariantBenchmarks(collection, name, variants, options = {}) {
  const attempts = [];
  for (const variant of variants) {
    const probe = await runAggregateBenchmark(collection, name, variant.pipeline, {
      ...options,
      metadata: variant.metadata || {},
    });
    attempts.push(probe);
  }

  const supportedAttempts = attempts.filter((attempt) => attempt.supported && !attempt.skipped);
  const selectedAttempt = supportedAttempts.sort((a, b) => (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity))[0] || attempts[0];

  return {
    ...selectedAttempt,
    attempts,
    supported: supportedAttempts.length > 0,
    skipped: attempts.length > 0 && attempts.every((attempt) => attempt.skipped),
    metadata: {
      ...selectedAttempt.metadata,
      attempts: attempts.map((attempt) => ({
        supported: attempt.supported,
        skipped: attempt.skipped,
        durationMs: attempt.durationMs,
        metadata: attempt.metadata,
        error: attempt.error,
      })),
    },
  };
}

function buildRecallComparison(strategyName, strategyTopIds, baselineTopIds) {
  return {
    strategy: strategyName,
    recallAtK: recallAtK(strategyTopIds, baselineTopIds),
    overlappingIds: (baselineTopIds || []).map(String).filter((id) => (strategyTopIds || []).map(String).includes(id)),
    missingBaselineIds: (baselineTopIds || []).map(String).filter((id) => !(strategyTopIds || []).map(String).includes(id)),
  };
}

async function collectionExists(db, collectionName) {
  try {
    const collections = await db.listCollections({ name: collectionName }).toArray();
    return collections.some((entry) => entry.name === collectionName);
  } catch {
    return false;
  }
}

function getRecommendation(results) {
  const annBestDuration = results.annPostFilter?.durationMs ?? Infinity;
  const feedbackCollectionDuration = results.feedbackCollectionAnn?.durationMs ?? Infinity;
  const denormalizedDuration = results.exactAfterDenormalizedMatch?.durationMs ?? Infinity;
  const lookupDuration = results.exactAfterFeedbackLookup?.durationMs ?? Infinity;

  if (Number.isFinite(feedbackCollectionDuration) && feedbackCollectionDuration < annBestDuration) {
    return 'dedicatedFeedbackCollection';
  }
  if (Number.isFinite(denormalizedDuration) && denormalizedDuration < annBestDuration) {
    return 'denormalizedPreFilter';
  }
  if (Number.isFinite(lookupDuration) && lookupDuration < annBestDuration) {
    return 'lookupPreFilter';
  }
  return 'annPostFilter';
}

function buildWarningList({ vectorSearchScoreSupport, annPreFilterSupported }) {
  const warnings = [];

  if (!vectorSearchScoreSupport) {
    warnings.push('DocumentDB does not expose vectorSearchScore. Keep local cosine scoring for returned candidates.');
  }

  if (!annPreFilterSupported) {
    warnings.push('ANN $vectorSearch cannot be pre-filtered in this cluster. To avoid searching non-feedback records, use a feedback-only collection or exact search after filtering.');
  }

  return warnings;
}

async function buildCapabilityResult() {
  await dbConnect();
  const db = mongoose.connection.db;
  const embeddings = db.collection('embeddings');
  const interactions = db.collection('interactions');
  const feedbackEmbeddings = db.collection(FEEDBACK_COLLECTION);

  const sample = await embeddings.findOne(
    VECTOR_EXISTS_FILTER,
    {
      projection: { [VECTOR_PATH]: 1 },
    }
  );

  const queryVector = sample?.[VECTOR_PATH];
  if (!Array.isArray(queryVector) || queryVector.length === 0) {
    return {
      available: false,
      message: 'No embeddings with questionsEmbedding were found.',
      counts: {
        totalEmbeddings: 0,
        embeddingsWithInteraction: 0,
        interactionsWithFeedback: 0,
        embeddingsWithFeedbackInteraction: 0,
        estimatedFeedbackSelectivity: null,
        estimatedCandidatesForTenFeedbackResults: null,
      },
      tests: {},
      benchmarks: {},
      recommendation: 'annPostFilter',
      warnings: [],
    };
  }

  const [
    totalEmbeddings,
    embeddingsWithInteraction,
    interactionsWithFeedback,
    embeddingsWithFeedbackInteractionResult,
    feedbackCollectionAvailable,
  ] = await Promise.all([
    embeddings.countDocuments(VECTOR_EXISTS_FILTER),
    embeddings.countDocuments({
      ...VECTOR_EXISTS_FILTER,
      interactionId: { $exists: true, $ne: null },
    }),
    interactions.countDocuments({
      expertFeedback: { $exists: true, $ne: null },
    }),
    embeddings.aggregate([
      { $match: VECTOR_EXISTS_FILTER },
      {
        $lookup: {
          from: 'interactions',
          localField: 'interactionId',
          foreignField: '_id',
          as: 'inter',
        },
      },
      { $unwind: { path: '$inter', preserveNullAndEmptyArrays: false } },
      { $match: { 'inter.expertFeedback': { $exists: true, $ne: null } } },
      { $count: 'count' },
    ]).toArray(),
    collectionExists(db, FEEDBACK_COLLECTION),
  ]);

  const embeddingsWithFeedbackInteraction = embeddingsWithFeedbackInteractionResult[0]?.count || 0;
  const estimatedFeedbackSelectivity = embeddingsWithInteraction
    ? embeddingsWithFeedbackInteraction / embeddingsWithInteraction
    : null;
  const estimatedCandidatesForTenFeedbackResults = estimatedFeedbackSelectivity && estimatedFeedbackSelectivity > 0
    ? Math.ceil(TARGET_K / estimatedFeedbackSelectivity)
    : null;

  const annPostFilterVariants = [];
  for (const candidateLimit of ANN_POST_FILTER_CANDIDATE_LIMIT_VALUES) {
    for (const numCandidates of ANN_POST_FILTER_NUM_CANDIDATES_VALUES) {
      annPostFilterVariants.push({
        metadata: {
          strategy: 'ann_all_then_feedback_post_filter',
          candidateLimit,
          numCandidates,
        },
        pipeline: [
          {
            $vectorSearch: {
              index: VECTOR_INDEX,
              path: VECTOR_PATH,
              queryVector,
              limit: candidateLimit,
              numCandidates,
              exact: false,
            },
          },
          {
            $project: {
              _id: 1,
              interactionId: 1,
              questionsEmbedding: 1,
            },
          },
        ],
      });
    }
  }

  const annPostFilterBenchmarks = [];
  for (const variant of annPostFilterVariants) {
    const vectorOnlyProbe = await runAggregateBenchmark(embeddings, 'ann_all_then_feedback_post_filter_vector_only', variant.pipeline, {
      queryVector,
      vectorField: VECTOR_PATH,
      topK: TARGET_K,
      metadata: variant.metadata,
    });

    const fullPipeline = [
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: VECTOR_PATH,
          queryVector,
          limit: variant.metadata.candidateLimit,
          numCandidates: variant.metadata.numCandidates,
          exact: false,
        },
      },
      {
        $lookup: {
          from: 'interactions',
          localField: 'interactionId',
          foreignField: '_id',
          as: 'inter',
        },
      },
      {
        $unwind: {
          path: '$inter',
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $match: {
          'inter.expertFeedback': { $exists: true, $ne: null },
        },
      },
      {
        $project: {
          _id: 1,
          interactionId: 1,
          expertFeedbackId: '$inter.expertFeedback',
          questionsEmbedding: 1,
        },
      },
      { $limit: TARGET_K },
    ];

    const fullProbe = await runAggregateBenchmark(embeddings, 'ann_all_then_feedback_post_filter', fullPipeline, {
      queryVector,
      vectorField: VECTOR_PATH,
      topK: TARGET_K,
      metadata: {
        ...variant.metadata,
        vectorResultCountBeforeFeedbackFilter: vectorOnlyProbe.resultCount,
        candidateReductionBeforeVectorSearch: false,
        vectorSearchStage: 'first',
      },
    });

    annPostFilterBenchmarks.push({
      ...fullProbe,
      strategy: 'ann_all_then_feedback_post_filter',
      vectorResultCountBeforeFeedbackFilter: vectorOnlyProbe.resultCount,
      finalFeedbackResultCount: fullProbe.finalResultCount,
      metadata: {
        ...fullProbe.metadata,
        candidateReductionBeforeVectorSearch: false,
        vectorSearchStage: 'first',
        vectorResultCountBeforeFeedbackFilter: vectorOnlyProbe.resultCount,
        finalFeedbackResultCount: fullProbe.finalResultCount,
      },
    });
  }

  const annPostFilter = annPostFilterBenchmarks
    .filter((benchmark) => benchmark.supported)
    .sort((a, b) => (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity))[0]
    || annPostFilterBenchmarks[0]
    || null;

  const exactAfterFeedbackLookupVariants = [
    {
      metadata: {
        strategy: 'exact_after_feedback_lookup_match',
        variant: 'no_index',
      },
      pipeline: [
        {
          $lookup: {
            from: 'interactions',
            localField: 'interactionId',
            foreignField: '_id',
            as: 'inter',
          },
        },
        {
          $unwind: {
            path: '$inter',
            preserveNullAndEmptyArrays: false,
          },
        },
        {
          $match: {
            'inter.expertFeedback': { $exists: true, $ne: null },
          },
        },
        {
          $vectorSearch: {
            path: VECTOR_PATH,
            queryVector,
            limit: TARGET_K,
            exact: true,
          },
        },
        {
          $project: {
            _id: 1,
            interactionId: 1,
            expertFeedbackId: '$inter.expertFeedback',
            questionsEmbedding: 1,
          },
        },
      ],
    },
    {
      metadata: {
        strategy: 'exact_after_feedback_lookup_match',
        variant: 'with_index',
      },
      pipeline: [
        {
          $lookup: {
            from: 'interactions',
            localField: 'interactionId',
            foreignField: '_id',
            as: 'inter',
          },
        },
        {
          $unwind: {
            path: '$inter',
            preserveNullAndEmptyArrays: false,
          },
        },
        {
          $match: {
            'inter.expertFeedback': { $exists: true, $ne: null },
          },
        },
        {
          $vectorSearch: {
            index: VECTOR_INDEX,
            path: VECTOR_PATH,
            queryVector,
            limit: TARGET_K,
            exact: true,
          },
        },
        {
          $project: {
            _id: 1,
            interactionId: 1,
            expertFeedbackId: '$inter.expertFeedback',
            questionsEmbedding: 1,
          },
        },
      ],
    },
  ];

  const exactAfterFeedbackLookup = await runVariantBenchmarks(embeddings, 'exact_after_feedback_lookup_match', exactAfterFeedbackLookupVariants, {
    queryVector,
    vectorField: VECTOR_PATH,
    topK: TARGET_K,
  });
  exactAfterFeedbackLookup.metadata = {
    ...exactAfterFeedbackLookup.metadata,
    candidateReductionBeforeVectorSearch: true,
    vectorSearchStage: 'afterFeedbackLookupAndMatch',
  };

  const denormalizedSample = await embeddings.findOne(
    {
      hasExpertFeedback: { $exists: true },
      expertFeedbackId: { $exists: true },
      expertFeedbackTotalScore: { $exists: true },
      pageLanguage: { $exists: true },
    },
    {
      projection: {
        hasExpertFeedback: 1,
        expertFeedbackId: 1,
        expertFeedbackTotalScore: 1,
        pageLanguage: 1,
      },
    }
  );

  let exactAfterDenormalizedMatch = {
    name: 'exact_after_denormalized_match',
    strategy: 'exact_after_denormalized_match',
    supported: false,
    skipped: true,
    resultCount: 0,
    finalResultCount: 0,
    sampleResults: [],
    scoreSummary: {
      numericScoreCount: 0,
      hasNumericScores: false,
      minScore: null,
      maxScore: null,
    },
    localScoreMin: null,
    localScoreMax: null,
    topIds: [],
    durationMs: null,
    durationsMs: [],
    metadata: {
      skipped: true,
      reason: 'denormalized expert feedback fields are not present on embeddings',
    },
    error: null,
  };

  if (denormalizedSample) {
    const denormVariants = [
      {
        metadata: {
          strategy: 'exact_after_denormalized_match',
          variant: 'no_filters',
        },
        pipeline: [
          {
            $match: {
              hasExpertFeedback: true,
            },
          },
          {
            $vectorSearch: {
              path: VECTOR_PATH,
              queryVector,
              limit: TARGET_K,
              exact: true,
            },
          },
          {
            $project: {
              _id: 1,
              interactionId: 1,
              expertFeedbackId: 1,
              expertFeedbackTotalScore: 1,
              pageLanguage: 1,
              questionsEmbedding: 1,
            },
          },
        ],
      },
      {
        metadata: {
          strategy: 'exact_after_denormalized_match',
          variant: 'with_index',
        },
        pipeline: [
          {
            $match: {
              hasExpertFeedback: true,
            },
          },
          {
            $vectorSearch: {
              index: VECTOR_INDEX,
              path: VECTOR_PATH,
              queryVector,
              limit: TARGET_K,
              exact: true,
            },
          },
          {
            $project: {
              _id: 1,
              interactionId: 1,
              expertFeedbackId: 1,
              expertFeedbackTotalScore: 1,
              pageLanguage: 1,
              questionsEmbedding: 1,
            },
          },
        ],
      },
    ];

    exactAfterDenormalizedMatch = await runVariantBenchmarks(embeddings, 'exact_after_denormalized_match', denormVariants, {
      queryVector,
      vectorField: VECTOR_PATH,
      topK: TARGET_K,
    });
    exactAfterDenormalizedMatch.metadata = {
      ...exactAfterDenormalizedMatch.metadata,
      candidateReductionBeforeVectorSearch: true,
      vectorSearchStage: 'afterLocalMatch',
    };
  }

  let feedbackCollectionAnn = {
    name: 'ann_feedback_only_collection',
    strategy: 'ann_feedback_only_collection',
    supported: false,
    skipped: true,
    resultCount: 0,
    finalResultCount: 0,
    sampleResults: [],
    scoreSummary: {
      numericScoreCount: 0,
      hasNumericScores: false,
      minScore: null,
      maxScore: null,
    },
    localScoreMin: null,
    localScoreMax: null,
    topIds: [],
    durationMs: null,
    durationsMs: [],
    metadata: {
      skipped: true,
      reason: 'feedback_embeddings collection is not available',
      collectionExists: false,
    },
    error: null,
  };

  if (feedbackCollectionAvailable) {
    const feedbackCount = await feedbackEmbeddings.countDocuments({
      questionsEmbedding: { $exists: true, $type: 'array', $not: { $size: 0 } },
    });
    const feedbackVariants = FEEDBACK_ANN_NUM_CANDIDATES_VALUES.map((numCandidates) => ({
      metadata: {
        strategy: 'ann_feedback_only_collection',
        numCandidates,
        collectionExists: true,
        collectionCount: feedbackCount,
      },
      pipeline: [
        {
          $vectorSearch: {
            index: FEEDBACK_VECTOR_INDEX,
            path: VECTOR_PATH,
            queryVector,
            limit: TARGET_K,
            numCandidates,
            exact: false,
          },
        },
        {
          $project: {
            _id: 1,
            sourceEmbeddingId: 1,
            interactionId: 1,
            expertFeedbackId: 1,
            expertFeedbackTotalScore: 1,
            pageLanguage: 1,
            questionsEmbedding: 1,
          },
        },
      ],
    }));

    feedbackCollectionAnn = await runVariantBenchmarks(feedbackEmbeddings, 'ann_feedback_only_collection', feedbackVariants, {
      queryVector,
      vectorField: VECTOR_PATH,
      topK: TARGET_K,
    });
    feedbackCollectionAnn = {
      ...feedbackCollectionAnn,
      strategy: 'ann_feedback_only_collection',
      collectionExists: true,
      collectionCount: feedbackCount,
      metadata: {
        ...feedbackCollectionAnn.metadata,
        candidateReductionBeforeVectorSearch: false,
        vectorSearchStage: 'first',
        collectionExists: true,
        collectionCount: feedbackCount,
      },
    };
  }

  const feedbackSubsetPipeline = [
    {
      $lookup: {
        from: 'interactions',
        localField: 'interactionId',
        foreignField: '_id',
        as: 'inter',
      },
    },
    {
      $unwind: {
        path: '$inter',
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $match: {
        'inter.expertFeedback': { $exists: true, $ne: null },
        questionsEmbedding: { $exists: true, $ne: null },
      },
    },
    {
      $project: {
        _id: 1,
        interactionId: 1,
        expertFeedbackId: '$inter.expertFeedback',
        questionsEmbedding: 1,
      },
    },
  ];

  const nodeBruteforceFeedbackSubset = await runAggregateBenchmark(embeddings, 'node_bruteforce_feedback_subset', feedbackSubsetPipeline, {
    queryVector,
    vectorField: VECTOR_PATH,
    topK: TARGET_K,
  });

  const benchmarkResults = {
    ann_all_then_feedback_post_filter: annPostFilterBenchmarks,
    exact_after_feedback_lookup_match: exactAfterFeedbackLookup.attempts,
    exact_after_denormalized_match: exactAfterDenormalizedMatch.attempts || [],
    ann_feedback_only_collection: feedbackCollectionAnn.attempts || [],
    node_bruteforce_feedback_subset: nodeBruteforceFeedbackSubset,
  };

  const tests = {
    ann_all_then_feedback_post_filter: annPostFilter,
    exact_after_feedback_lookup_match: exactAfterFeedbackLookup,
    exact_after_denormalized_match: exactAfterDenormalizedMatch,
    ann_feedback_only_collection: feedbackCollectionAnn,
    node_bruteforce_feedback_subset: nodeBruteforceFeedbackSubset,
    vectorSearchThenFeedbackFilter: annPostFilter,
    feedbackFilterBeforeVectorSearch: exactAfterFeedbackLookup,
    simpleMatchBeforeVectorSearch: exactAfterDenormalizedMatch,
  };

  const baselineTopIds = nodeBruteforceFeedbackSubset.topIds || [];
  const recallComparisons = [
    buildRecallComparison('ann_all_then_feedback_post_filter', annPostFilter?.topIds || [], baselineTopIds),
    buildRecallComparison('exact_after_feedback_lookup_match', exactAfterFeedbackLookup?.topIds || [], baselineTopIds),
    buildRecallComparison('exact_after_denormalized_match', exactAfterDenormalizedMatch?.topIds || [], baselineTopIds),
    buildRecallComparison('ann_feedback_only_collection', feedbackCollectionAnn?.topIds || [], baselineTopIds),
  ];

  const recommendation = getRecommendation({
    annPostFilter,
    exactAfterFeedbackLookup,
    exactAfterDenormalizedMatch,
    feedbackCollectionAnn,
  });

  const warnings = buildWarningList({
    vectorSearchScoreSupport: false,
    annPreFilterSupported: Boolean(exactAfterFeedbackLookup?.supported || exactAfterDenormalizedMatch?.supported),
  });

  return {
    available: true,
    sampleEmbeddingId: serializeValue(sample._id),
    vectorPath: VECTOR_PATH,
    vectorIndex: VECTOR_INDEX,
    counts: {
      totalEmbeddings,
      embeddingsWithInteraction,
      interactionsWithFeedback,
      embeddingsWithFeedbackInteraction,
      estimatedFeedbackSelectivity,
      estimatedCandidatesForTenFeedbackResults,
    },
    capabilities: {
      vectorSearchBasicSupport: Boolean(annPostFilter?.supported),
      vectorSearchScoreSupport: false,
      postFilterAfterVectorSearch: Boolean(annPostFilter?.supported),
      simpleMatchBeforeVectorSearch: Boolean(exactAfterDenormalizedMatch?.supported),
      feedbackLookupFilterBeforeVectorSearch: Boolean(exactAfterFeedbackLookup?.supported),
      exactAfterFeedbackLookupSupport: Boolean(exactAfterFeedbackLookup?.supported),
      exactAfterDenormalizedMatchSupport: Boolean(exactAfterDenormalizedMatch?.supported),
      feedbackCollectionAnnSupport: Boolean(feedbackCollectionAnn?.supported),
      nodeBruteforceFeedbackSubsetSupport: Boolean(nodeBruteforceFeedbackSubset?.supported),
      annPreFilterSupported: Boolean(exactAfterFeedbackLookup?.supported || exactAfterDenormalizedMatch?.supported),
    },
    warnings,
    tests,
    benchmarks: benchmarkResults,
    recallComparisons,
    recommendation,
  };
}

async function vectorDocdb8CapabilityTestHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const result = await buildCapabilityResult();
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error running DocumentDB 8 vector capability test:', error);
    return res.status(500).json({
      error: 'Failed to run DocumentDB 8 vector capability test',
      details: error.message,
    });
  }
}

export default function handler(req, res) {
  return withProtection(vectorDocdb8CapabilityTestHandler, authMiddleware, adminMiddleware)(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export {
  buildCapabilityResult,
  buildWarningList,
  buildRecallComparison,
  collectionExists,
  cosineFromDoc,
  formatResult,
  getRecommendation,
  median,
  recallAtK,
  runAggregateBenchmark,
  runVariantBenchmarks,
  summarizeScores,
};
