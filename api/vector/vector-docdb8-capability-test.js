// api/vector/vector-docdb8-capability-test.js
import mongoose from 'mongoose';
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';
import dbConnect from '../db/db-connect.js';

const VECTOR_INDEX = 'questions_vector_index';
const VECTOR_PATH = 'questionsEmbedding';
const VECTOR_EXISTS_FILTER = {
  [VECTOR_PATH]: { $exists: true, $type: 'array', $not: { $size: 0 } },
};

function serializeValue(value) {
  return value?.toString?.() || value;
}

function serializeResult(row) {
  return {
    _id: serializeValue(row._id),
    interactionId: serializeValue(row.interactionId),
    expertFeedbackId: serializeValue(row.expertFeedbackId),
    similarity: typeof row.similarity === 'number' ? row.similarity : null,
  };
}

function summarizeScores(docs) {
  const scores = docs
    .map((doc) => doc.similarity)
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
  };
}

async function runProbe(collection, name, pipeline, metadata = {}) {
  const start = Date.now();
  try {
    const docs = await collection.aggregate(pipeline).toArray();
    const scoreSummary = summarizeScores(docs);
    return {
      name,
      supported: true,
      resultCount: docs.length,
      sampleResults: docs.slice(0, 5).map(serializeResult),
      scoreSummary,
      durationMs: Date.now() - start,
      metadata,
      error: null,
    };
  } catch (error) {
    return {
      name,
      supported: false,
      resultCount: 0,
      sampleResults: [],
      scoreSummary: {
        numericScoreCount: 0,
        hasNumericScores: false,
        minScore: null,
        maxScore: null,
      },
      durationMs: Date.now() - start,
      metadata,
      error: serializeError(error),
    };
  }
}

function getRecommendation(tests) {
  if (tests.feedbackFilterBeforeVectorSearch?.supported) {
    return 'lookupPreFilter';
  }
  if (tests.simpleMatchBeforeVectorSearch?.supported) {
    return 'denormalizedPreFilter';
  }
  return 'dedicatedFeedbackCollection';
}

async function buildCapabilityResult() {
  await dbConnect();
  const db = mongoose.connection.db;
  const embeddings = db.collection('embeddings');
  const interactions = db.collection('interactions');

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
      recommendation: 'dedicatedFeedbackCollection',
    };
  }

  const [
    totalEmbeddings,
    embeddingsWithInteraction,
    interactionsWithFeedback,
    embeddingsWithFeedbackInteractionResult,
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
  ]);

  const embeddingsWithFeedbackInteraction = embeddingsWithFeedbackInteractionResult[0]?.count || 0;
  const estimatedFeedbackSelectivity = embeddingsWithInteraction
    ? embeddingsWithFeedbackInteraction / embeddingsWithInteraction
    : null;
  const estimatedCandidatesForTenFeedbackResults = estimatedFeedbackSelectivity && estimatedFeedbackSelectivity > 0
    ? Math.ceil(10 / estimatedFeedbackSelectivity)
    : null;

  const vectorSearchThenFeedbackFilter = [
    {
      $vectorSearch: {
        index: VECTOR_INDEX,
        path: VECTOR_PATH,
        queryVector,
        limit: 50,
        numCandidates: 200,
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
        similarity: { $meta: 'vectorSearchScore' },
      },
    },
    { $limit: 10 },
  ];

  const feedbackFilterBeforeVectorSearch = [
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
        limit: 10,
        numCandidates: 100,
        exact: false,
      },
    },
    {
      $project: {
        _id: 1,
        interactionId: 1,
        expertFeedbackId: '$inter.expertFeedback',
        similarity: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  const simpleMatchBeforeVectorSearch = [
    {
      $match: {
        interactionId: { $exists: true, $ne: null },
      },
    },
    {
      $vectorSearch: {
        index: VECTOR_INDEX,
        path: VECTOR_PATH,
        queryVector,
        limit: 10,
        numCandidates: 100,
        exact: false,
      },
    },
    {
      $project: {
        _id: 1,
        interactionId: 1,
        similarity: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  const [
    postFilter,
    lookupPreFilter,
    simplePreFilter,
  ] = await Promise.all([
    runProbe(embeddings, 'vectorSearchThenFeedbackFilter', vectorSearchThenFeedbackFilter, {
      candidateReductionBeforeVectorSearch: false,
      vectorSearchStage: 'first',
      limit: 50,
      numCandidates: 200,
      optimizationMeaning: 'Fallback path: validates $vectorSearch, score projection, and post-filtering after vector search.',
    }),
    runProbe(embeddings, 'feedbackFilterBeforeVectorSearch', feedbackFilterBeforeVectorSearch, {
      candidateReductionBeforeVectorSearch: true,
      vectorSearchStage: 'afterFeedbackLookupAndMatch',
      limit: 10,
      numCandidates: 100,
      optimizationMeaning: 'Best path if supported: lets aggregation reduce candidates to feedback-backed records before vector search.',
    }),
    runProbe(embeddings, 'simpleMatchBeforeVectorSearch', simpleMatchBeforeVectorSearch, {
      candidateReductionBeforeVectorSearch: true,
      vectorSearchStage: 'afterLocalMatch',
      limit: 10,
      numCandidates: 100,
      optimizationMeaning: 'Denormalization path if supported: local embedding fields can be matched before vector search.',
    }),
  ]);

  const tests = {
    vectorSearchThenFeedbackFilter: postFilter,
    feedbackFilterBeforeVectorSearch: lookupPreFilter,
    simpleMatchBeforeVectorSearch: simplePreFilter,
  };

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
      vectorSearchBasicSupport: postFilter.supported,
      vectorSearchScoreSupport: postFilter.scoreSummary.hasNumericScores,
      postFilterAfterVectorSearch: postFilter.supported,
      simpleMatchBeforeVectorSearch: simplePreFilter.supported,
      feedbackLookupFilterBeforeVectorSearch: lookupPreFilter.supported,
    },
    tests,
    recommendation: getRecommendation(tests),
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

export { buildCapabilityResult };
