import dbConnect from './db-connect.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import mongoose from 'mongoose';

async function countOrphanCitations(limit = 0) {
  const Citation = mongoose.models.Citation;
  const Answer = mongoose.models.Answer;
  if (!Citation) return { count: 0, samples: [] };

  // Get ids referenced by answers
  const used = Answer ? await Answer.distinct('citation') : [];
  const filter = used && used.length ? { _id: { $nin: used } } : {};
  const count = await Citation.countDocuments(filter);
  const samples = limit ? await Citation.find(filter).limit(limit).lean().select('_id aiCitationUrl providedCitationUrl citationHead') : [];
  return { count, samples };
}

async function countOrphanTools(limit = 0) {
  const Tool = mongoose.models.Tool;
  const Answer = mongoose.models.Answer;
  if (!Tool) return { count: 0, samples: [] };
  const used = Answer ? await Answer.distinct('tools') : [];
  const filter = used && used.length ? { _id: { $nin: used } } : {};
  const count = await Tool.countDocuments(filter);
  const samples = limit ? await Tool.find(filter).limit(limit).lean().select('_id tool status') : [];
  return { count, samples };
}

async function countEmbeddingsMissingRefs(limit = 0) {
  const Embedding = mongoose.models.Embedding;
  if (!Embedding) return { count: 0, samples: [] };

  // Use aggregation with lookups to detect missing referenced docs.
  // We'll return a breakdown of which reference is missing and sample documents
  // Use simple left-lookup by matching localField -> foreign _id.
  const pipeline = [
    { $lookup: { from: 'chats', localField: 'chatId', foreignField: '_id', as: 'chat' } },
    { $lookup: { from: 'interactions', localField: 'interactionId', foreignField: '_id', as: 'interaction' } },
    { $lookup: { from: 'questions', localField: 'questionId', foreignField: '_id', as: 'question' } },
    { $lookup: { from: 'answers', localField: 'answerId', foreignField: '_id', as: 'answer' } },
    // mark missing flags
    {
      $addFields: {
        missingChat: { $eq: [{ $size: '$chat' }, 0] },
        missingInteraction: { $eq: [{ $size: '$interaction' }, 0] },
        missingQuestion: { $eq: [{ $size: '$question' }, 0] },
        missingAnswer: { $eq: [{ $size: '$answer' }, 0] }
      }
    },
    // Only keep documents that have at least one missing ref
    { $match: { $or: [{ missingChat: true }, { missingInteraction: true }, { missingQuestion: true }, { missingAnswer: true }] } },
    // Facet to get counts and samples
    {
      $facet: {
        counts: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              missingChat: { $sum: { $cond: ['$missingChat', 1, 0] } },
              missingInteraction: { $sum: { $cond: ['$missingInteraction', 1, 0] } },
              missingQuestion: { $sum: { $cond: ['$missingQuestion', 1, 0] } },
              missingAnswer: { $sum: { $cond: ['$missingAnswer', 1, 0] } }
            }
          }
        ],
        samples: [
          { $project: { _id: 1, chatId: 1, interactionId: 1, questionId: 1, answerId: 1, missingChat: 1, missingInteraction: 1, missingQuestion: 1, missingAnswer: 1 } },
          { $limit: limit }
        ]
      }
    }
  ];

  const res = await Embedding.aggregate(pipeline).allowDiskUse(true).exec();
  const counts = (res && res[0] && res[0].counts && res[0].counts[0]) ? res[0].counts[0] : null;
  const samples = (res && res[0] && Array.isArray(res[0].samples)) ? res[0].samples : [];

  const count = counts ? counts.total : 0;
  const breakdown = counts ? {
    missingChat: counts.missingChat || 0,
    missingInteraction: counts.missingInteraction || 0,
    missingQuestion: counts.missingQuestion || 0,
    missingAnswer: counts.missingAnswer || 0
  } : { missingChat: 0, missingInteraction: 0, missingQuestion: 0, missingAnswer: 0 };

  return { count, breakdown, samples };
}

async function countSentenceEmbeddingOrphans(limit = 0) {
  const SentenceEmbedding = mongoose.models.SentenceEmbedding;
  const Embedding = mongoose.models.Embedding;
  if (!SentenceEmbedding) return { count: 0, samples: [] };

  const pipeline = [];
  pipeline.push({ $lookup: { from: 'embeddings', localField: 'parentEmbeddingId', foreignField: '_id', as: 'parent' } });
  pipeline.push({ $match: { $expr: { $eq: [{ $size: '$parent' }, 0] } } });
  pipeline.push({ $count: 'count' });
  const res = await SentenceEmbedding.aggregate(pipeline).allowDiskUse(true).exec();
  const count = (res && res[0] && res[0].count) ? res[0].count : 0;

  let samples = [];
  if (limit) {
    const samplePipeline = [];
    samplePipeline.push({ $lookup: { from: 'embeddings', localField: 'parentEmbeddingId', foreignField: '_id', as: 'parent' } });
    samplePipeline.push({ $match: { $expr: { $eq: [{ $size: '$parent' }, 0] } } });
    samplePipeline.push({ $project: { _id: 1, parentEmbeddingId: 1, sentenceIndex: 1 } });
    samplePipeline.push({ $limit: limit });
    samples = await SentenceEmbedding.aggregate(samplePipeline).allowDiskUse(true).exec();
  }

  return { count, samples };
}

async function countOrphanExpertFeedback(limit = 0) {
  const ExpertFeedback = mongoose.models.ExpertFeedback;
  const Interaction = mongoose.models.Interaction;
  const Eval = mongoose.models.Eval;
  if (!ExpertFeedback) return { count: 0, samples: [] };

  const used1 = Interaction ? await Interaction.distinct('expertFeedback') : [];
  const used2 = Eval ? await Eval.distinct('expertFeedback') : [];
  const used = Array.from(new Set([...(used1 || []), ...(used2 || [])]));
  const filter = used && used.length ? { _id: { $nin: used } } : {};
  const count = await ExpertFeedback.countDocuments(filter);
  const samples = limit ? await ExpertFeedback.find(filter).limit(limit).lean().select('_id totalScore expertEmail') : [];
  return { count, samples };
}

async function countOrphanPublicFeedback(limit = 0) {
  const PublicFeedback = mongoose.models.PublicFeedback;
  const Interaction = mongoose.models.Interaction;
  if (!PublicFeedback) return { count: 0, samples: [] };

  const used = Interaction ? await Interaction.distinct('publicFeedback') : [];
  const filter = used && used.length ? { _id: { $nin: used } } : {};
  const count = await PublicFeedback.countDocuments(filter);
  const samples = limit ? await PublicFeedback.find(filter).limit(limit).lean().select('_id feedback publicFeedbackScore') : [];
  return { count, samples };
}

async function countOrphanQuestions(limit = 0) {
  const Question = mongoose.models.Question;
  const Interaction = mongoose.models.Interaction;
  const Embedding = mongoose.models.Embedding;
  if (!Question) return { count: 0, samples: [] };

  const used1 = Interaction ? await Interaction.distinct('question') : [];
  const used2 = Embedding ? await Embedding.distinct('questionId') : [];
  const used = Array.from(new Set([...(used1 || []), ...(used2 || [])]));
  const filter = used && used.length ? { _id: { $nin: used } } : {};
  const count = await Question.countDocuments(filter);
  const samples = limit ? await Question.find(filter).limit(limit).lean().select('_id redactedQuestion') : [];
  return { count, samples };
}

async function countOrphanAnswers(limit = 0) {
  const Answer = mongoose.models.Answer;
  const Interaction = mongoose.models.Interaction;
  const Embedding = mongoose.models.Embedding;
  if (!Answer) return { count: 0, samples: [] };

  // Consider answers referenced by interactions and by embeddings.answerId
  const used1 = Interaction ? await Interaction.distinct('answer') : [];
  const used2 = Embedding ? await Embedding.distinct('answerId') : [];
  const used = Array.from(new Set([...(used1 || []), ...(used2 || [])]));
  const filter = used && used.length ? { _id: { $nin: used } } : {};
  const count = await Answer.countDocuments(filter);
  const samples = limit ? await Answer.find(filter).limit(limit).lean().select('_id content') : [];
  return { count, samples };
}

async function countEvalInvalidInteraction(limit = 0) {
  const Eval = mongoose.models.Eval;
  if (!Eval) return { count: 0, samples: [] };

  const pipeline = [];
  pipeline.push({ $lookup: { from: 'interactions', localField: 'matchedInteractionId', foreignField: '_id', as: 'interactionDoc' } });
  pipeline.push({ $match: { matchedInteractionId: { $exists: true, $ne: null }, $expr: { $eq: [{ $size: '$interactionDoc' }, 0] } } });
  pipeline.push({ $count: 'count' });
  const res = await Eval.aggregate(pipeline).allowDiskUse(true).exec();
  const count = (res && res[0] && res[0].count) ? res[0].count : 0;

  let samples = [];
  if (limit && count > 0) {
    const samplePipeline = [];
    samplePipeline.push({ $lookup: { from: 'interactions', localField: 'matchedInteractionId', foreignField: '_id', as: 'interactionDoc' } });
    samplePipeline.push({ $match: { matchedInteractionId: { $exists: true, $ne: null }, $expr: { $eq: [{ $size: '$interactionDoc' }, 0] } } });
    samplePipeline.push({ $project: { _id: 1, matchedInteractionId: 1 } });
    samplePipeline.push({ $limit: limit });
    samples = await Eval.aggregate(samplePipeline).allowDiskUse(true).exec();
  }

  return { count, samples };
}

async function countOrphanInteractions(limit = 0) {
  const Interaction = mongoose.models.Interaction;
  if (!Interaction) return { count: 0, samples: [] };

  // Find Interaction documents that are not referenced in any Chat.interactions array
  const pipeline = [];
  pipeline.push({ $lookup: { from: 'chats', localField: '_id', foreignField: 'interactions', as: 'chatDoc' } });
  pipeline.push({ $match: { $expr: { $eq: [{ $size: '$chatDoc' }, 0] } } });
  pipeline.push({ $count: 'count' });
  const res = await Interaction.aggregate(pipeline).allowDiskUse(true).exec();
  const count = (res && res[0] && res[0].count) ? res[0].count : 0;

  let samples = [];
  if (limit && count > 0) {
    const samplePipeline = [];
    samplePipeline.push({ $lookup: { from: 'chats', localField: '_id', foreignField: 'interactions', as: 'chatDoc' } });
    samplePipeline.push({ $match: { $expr: { $eq: [{ $size: '$chatDoc' }, 0] } } });
    samplePipeline.push({ $project: { _id: 1, createdAt: 1, answer: 1, question: 1 } });
    samplePipeline.push({ $limit: limit });
    samples = await Interaction.aggregate(samplePipeline).allowDiskUse(true).exec();
  }

  return { count, samples };
}

async function countAnswersMissingEmbedding(limit = 0) {
  const Answer = mongoose.models.Answer;
  const Embedding = mongoose.models.Embedding;
  if (!Answer) return { count: 0, samples: [] };

  // Left lookup embeddings by answer._id
  const pipeline = [];
  pipeline.push({ $lookup: { from: 'embeddings', localField: '_id', foreignField: 'answerId', as: 'emb' } });
  pipeline.push({ $match: { $expr: { $eq: [{ $size: '$emb' }, 0] } } });
  pipeline.push({ $count: 'count' });
  const res = await Answer.aggregate(pipeline).allowDiskUse(true).exec();
  const count = (res && res[0] && res[0].count) ? res[0].count : 0;

  let samples = [];
  if (limit && count > 0) {
    const samplePipeline = [];
    samplePipeline.push({ $lookup: { from: 'embeddings', localField: '_id', foreignField: 'answerId', as: 'emb' } });
    samplePipeline.push({ $match: { $expr: { $eq: [{ $size: '$emb' }, 0] } } });
    samplePipeline.push({ $project: { _id: 1, content: 1 } });
    samplePipeline.push({ $limit: limit });
    samples = await Answer.aggregate(samplePipeline).allowDiskUse(true).exec();
  }

  return { count, samples };
}

async function countBatchItemsMissingBatch(limit = 0) {
  const BatchItem = mongoose.models.BatchItem;
  if (!BatchItem) return { count: 0, samples: [] };

  const pipeline = [];
  pipeline.push({ $lookup: { from: 'batches', localField: 'batch', foreignField: '_id', as: 'batchDoc' } });
  pipeline.push({ $match: { $expr: { $eq: [{ $size: '$batchDoc' }, 0] } } });
  pipeline.push({ $count: 'count' });
  const res = await BatchItem.aggregate(pipeline).allowDiskUse(true).exec();
  const count = (res && res[0] && res[0].count) ? res[0].count : 0;

  let samples = [];
  if (limit && count > 0) {
    const samplePipeline = [];
    samplePipeline.push({ $lookup: { from: 'batches', localField: 'batch', foreignField: '_id', as: 'batchDoc' } });
    samplePipeline.push({ $match: { $expr: { $eq: [{ $size: '$batchDoc' }, 0] } } });
    samplePipeline.push({ $project: { _id: 1, rowIndex: 1, chat: 1 } });
    samplePipeline.push({ $limit: limit });
    samples = await BatchItem.aggregate(samplePipeline).allowDiskUse(true).exec();
  }

  return { count, samples };
}

async function countBatchesWithoutItems(limit = 0) {
  const Batch = mongoose.models.Batch;
  if (!Batch) return { count: 0, samples: [] };

  const pipeline = [];
  pipeline.push({ $lookup: { from: 'batchitems', localField: '_id', foreignField: 'batch', as: 'items' } });
  pipeline.push({ $match: { $expr: { $eq: [{ $size: '$items' }, 0] } } });
  pipeline.push({ $count: 'count' });
  const res = await Batch.aggregate(pipeline).allowDiskUse(true).exec();
  const count = (res && res[0] && res[0].count) ? res[0].count : 0;

  let samples = [];
  if (limit && count > 0) {
    const samplePipeline = [];
    samplePipeline.push({ $lookup: { from: 'batchitems', localField: '_id', foreignField: 'batch', as: 'items' } });
    samplePipeline.push({ $match: { $expr: { $eq: [{ $size: '$items' }, 0] } } });
    samplePipeline.push({ $project: { _id: 1, name: 1 } });
    samplePipeline.push({ $limit: limit });
    samples = await Batch.aggregate(samplePipeline).allowDiskUse(true).exec();
  }

  return { count, samples };
}

async function countInteractionMissingChildren(limit = 0) {
  const Interaction = mongoose.models.Interaction;
  if (!Interaction) return { count: 0, samples: [] };

  const pipeline = [];
  pipeline.push({ $lookup: { from: 'answers', localField: 'answer', foreignField: '_id', as: 'answerDoc' } });
  pipeline.push({ $lookup: { from: 'questions', localField: 'question', foreignField: '_id', as: 'questionDoc' } });
  pipeline.push({ $lookup: { from: 'expertfeedbacks', localField: 'expertFeedback', foreignField: '_id', as: 'expertFeedbackDoc' } });
  pipeline.push({ $lookup: { from: 'publicfeedbacks', localField: 'publicFeedback', foreignField: '_id', as: 'publicFeedbackDoc' } });
  pipeline.push({ $lookup: { from: 'evals', localField: 'autoEval', foreignField: '_id', as: 'evalDoc' } });
  pipeline.push({ $lookup: { from: 'contexts', localField: 'context', foreignField: '_id', as: 'contextDoc' } });

  pipeline.push({
    $match: {
      $or: [
        { $and: [{ answer: { $exists: true } }, { $expr: { $eq: [{ $size: '$answerDoc' }, 0] } }] },
        { $and: [{ question: { $exists: true } }, { $expr: { $eq: [{ $size: '$questionDoc' }, 0] } }] },
        { $and: [{ expertFeedback: { $exists: true } }, { $expr: { $eq: [{ $size: '$expertFeedbackDoc' }, 0] } }] },
        { $and: [{ publicFeedback: { $exists: true } }, { $expr: { $eq: [{ $size: '$publicFeedbackDoc' }, 0] } }] },
        { $and: [{ autoEval: { $exists: true } }, { $expr: { $eq: [{ $size: '$evalDoc' }, 0] } }] },
        { $and: [{ context: { $exists: true } }, { $expr: { $eq: [{ $size: '$contextDoc' }, 0] } }] }
      ]
    }
  });

  pipeline.push({ $count: 'count' });
  const res = await Interaction.aggregate(pipeline).allowDiskUse(true).exec();
  const count = (res && res[0] && res[0].count) ? res[0].count : 0;

  let samples = [];
  if (limit && count > 0) {
    const samplePipeline = pipeline.slice(0, -1);
    samplePipeline.push({ $project: { _id: 1, interactionId: 1, answer: 1, question: 1, expertFeedback: 1, publicFeedback: 1, autoEval: 1, context: 1 } });
    samplePipeline.push({ $limit: limit });
    samples = await Interaction.aggregate(samplePipeline).allowDiskUse(true).exec();
  }

  return { count, samples };
}

async function countEvalInvalidExpertFeedback(limit = 0) {
  const Eval = mongoose.models.Eval;
  if (!Eval) return { count: 0, samples: [] };

  const pipeline = [];
  pipeline.push({ $lookup: { from: 'expertfeedbacks', localField: 'expertFeedback', foreignField: '_id', as: 'expertFeedbackDoc' } });
  pipeline.push({ $match: { expertFeedback: { $exists: true, $ne: null }, $expr: { $eq: [{ $size: '$expertFeedbackDoc' }, 0] } } });
  pipeline.push({ $count: 'count' });
  const res = await Eval.aggregate(pipeline).allowDiskUse(true).exec();
  const count = (res && res[0] && res[0].count) ? res[0].count : 0;

  let samples = [];
  if (limit && count > 0) {
    const samplePipeline = [];
    samplePipeline.push({ $lookup: { from: 'expertfeedbacks', localField: 'expertFeedback', foreignField: '_id', as: 'expertFeedbackDoc' } });
    samplePipeline.push({ $match: { expertFeedback: { $exists: true, $ne: null }, $expr: { $eq: [{ $size: '$expertFeedbackDoc' }, 0] } } });
    samplePipeline.push({ $project: { _id: 1, expertFeedback: 1 } });
    samplePipeline.push({ $limit: limit });
    samples = await Eval.aggregate(samplePipeline).allowDiskUse(true).exec();
  }

  return { count, samples };
}

async function countScenarioOverrideMissingUser(limit = 0) {
  const ScenarioOverride = mongoose.models.ScenarioOverride;
  if (!ScenarioOverride) return { count: 0, samples: [] };

  const pipeline = [];
  pipeline.push({ $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'userDoc' } });
  pipeline.push({ $match: { $expr: { $eq: [{ $size: '$userDoc' }, 0] } } });
  pipeline.push({ $count: 'count' });
  const res = await ScenarioOverride.aggregate(pipeline).allowDiskUse(true).exec();
  const count = (res && res[0] && res[0].count) ? res[0].count : 0;

  let samples = [];
  if (limit && count > 0) {
    const samplePipeline = [];
    samplePipeline.push({ $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'userDoc' } });
    samplePipeline.push({ $match: { $expr: { $eq: [{ $size: '$userDoc' }, 0] } } });
    samplePipeline.push({ $project: { _id: 1, userId: 1, departmentKey: 1 } });
    samplePipeline.push({ $limit: limit });
    samples = await ScenarioOverride.aggregate(samplePipeline).allowDiskUse(true).exec();
  }

  return { count, samples };
}

async function countChatInvalidUser(limit = 0) {
  const Chat = mongoose.models.Chat;
  if (!Chat) return { count: 0, samples: [] };

  const pipeline = [];
  pipeline.push({ $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userDoc' } });
  pipeline.push({ $match: { user: { $exists: true, $ne: null }, $expr: { $eq: [{ $size: '$userDoc' }, 0] } } });
  pipeline.push({ $count: 'count' });
  const res = await Chat.aggregate(pipeline).allowDiskUse(true).exec();
  const count = (res && res[0] && res[0].count) ? res[0].count : 0;

  let samples = [];
  if (limit && count > 0) {
    const samplePipeline = [];
    samplePipeline.push({ $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userDoc' } });
    samplePipeline.push({ $match: { user: { $exists: true, $ne: null }, $expr: { $eq: [{ $size: '$userDoc' }, 0] } } });
    samplePipeline.push({ $project: { _id: 1, chatId: 1, user: 1 } });
    samplePipeline.push({ $limit: limit });
    samples = await Chat.aggregate(samplePipeline).allowDiskUse(true).exec();
  }

  return { count, samples };
}

async function countLogsChatIdMissingChat(limit = 0) {
  const Logs = mongoose.models.Logs;
  const Chat = mongoose.models.Chat;
  if (!Logs) return { count: 0, samples: [] };

  const pipeline = [];
  pipeline.push({ $lookup: { from: 'chats', localField: 'chatId', foreignField: 'chatId', as: 'chatDoc' } });
  pipeline.push({ $match: { chatId: { $exists: true, $ne: null }, $expr: { $eq: [{ $size: '$chatDoc' }, 0] } } });
  pipeline.push({ $count: 'count' });
  const res = await Logs.aggregate(pipeline).allowDiskUse(true).exec();
  const count = (res && res[0] && res[0].count) ? res[0].count : 0;

  let samples = [];
  if (limit && count > 0) {
    const samplePipeline = [];
    samplePipeline.push({ $lookup: { from: 'chats', localField: 'chatId', foreignField: 'chatId', as: 'chatDoc' } });
    samplePipeline.push({ $match: { chatId: { $exists: true, $ne: null }, $expr: { $eq: [{ $size: '$chatDoc' }, 0] } } });
    samplePipeline.push({ $project: { _id: 1, chatId: 1, logLevel: 1, message: 1 } });
    samplePipeline.push({ $limit: limit });
    samples = await Logs.aggregate(samplePipeline).allowDiskUse(true).exec();
  }

  return { count, samples };
}

async function countSentenceEmbeddingIndexIssues(limit = 0) {
  const SentenceEmbedding = mongoose.models.SentenceEmbedding;
  if (!SentenceEmbedding) return { count: 0, samples: [] };

  const pipeline = [];
  // lookup parent embedding
  pipeline.push({ $lookup: { from: 'embeddings', localField: 'parentEmbeddingId', foreignField: '_id', as: 'parent' } });
  // lookup answer via parent.answerId
  pipeline.push({ $lookup: { from: 'answers', localField: 'parent.answerId', foreignField: '_id', as: 'answer' } });
  // Conditions: parent missing OR answer missing OR sentenceIndex < 0 OR sentenceIndex >= size(answer.sentences)
  pipeline.push({
    $match: {
      $or: [
        { $expr: { $eq: [{ $size: '$parent' }, 0] } },
        { $expr: { $eq: [{ $size: '$answer' }, 0] } },
        { sentenceIndex: { $lt: 0 } },
        { $expr: { $gt: ['$sentenceIndex', { $subtract: [{ $size: { $ifNull: [{ $arrayElemAt: ['$answer.sentences', 0] }, []] } }, 1] }] } }
      ]
    }
  });

  pipeline.push({ $count: 'count' });
  const res = await SentenceEmbedding.aggregate(pipeline).allowDiskUse(true).exec();
  const count = (res && res[0] && res[0].count) ? res[0].count : 0;

  let samples = [];
  if (limit && count > 0) {
    const samplePipeline = [];
    samplePipeline.push({ $lookup: { from: 'embeddings', localField: 'parentEmbeddingId', foreignField: '_id', as: 'parent' } });
    samplePipeline.push({ $lookup: { from: 'answers', localField: 'parent.answerId', foreignField: '_id', as: 'answer' } });
    samplePipeline.push({
      $match: {
        $or: [
          { $expr: { $eq: [{ $size: '$parent' }, 0] } },
          { $expr: { $eq: [{ $size: '$answer' }, 0] } },
          { sentenceIndex: { $lt: 0 } },
          { $expr: { $gt: ['$sentenceIndex', { $subtract: [{ $size: { $ifNull: [{ $arrayElemAt: ['$answer.sentences', 0] }, []] } }, 1] }] } }
        ]
      }
    });
    samplePipeline.push({ $project: { _id: 1, parentEmbeddingId: 1, sentenceIndex: 1 } });
    samplePipeline.push({ $limit: limit });
    samples = await SentenceEmbedding.aggregate(samplePipeline).allowDiskUse(true).exec();
  }

  return { count, samples };
}

async function countParentInvalidChildren(parentModelName, childField, childCollectionName, limit = 0) {
  // Generic: unwinds parent.childField and lookups childCollectionName to find parents that reference missing children
  const Parent = mongoose.models[parentModelName];
  if (!Parent) return { count: 0, samples: [] };

  const pipeline = [];
  pipeline.push({ $match: { [childField]: { $exists: true, $ne: [] } } });
  pipeline.push({ $unwind: `$${childField}` });
  pipeline.push({ $lookup: { from: childCollectionName, localField: childField, foreignField: '_id', as: 'child' } });
  pipeline.push({ $match: { 'child.0': { $exists: false } } });
  pipeline.push({ $group: { _id: '$_id' } });
  pipeline.push({ $count: 'count' });

  const res = await Parent.aggregate(pipeline).allowDiskUse(true).exec();
  const count = (res && res[0] && res[0].count) ? res[0].count : 0;

  let samples = [];
  if (limit && count > 0) {
    const samplePipeline = [];
    samplePipeline.push({ $match: { [childField]: { $exists: true, $ne: [] } } });
    samplePipeline.push({ $unwind: `$${childField}` });
    samplePipeline.push({ $lookup: { from: childCollectionName, localField: childField, foreignField: '_id', as: 'child' } });
    samplePipeline.push({ $match: { 'child.0': { $exists: false } } });
    samplePipeline.push({ $group: { _id: '$_id', missingChildren: { $push: `$${childField}` } } });
    samplePipeline.push({ $limit: limit });
    samples = await Parent.aggregate(samplePipeline).allowDiskUse(true).exec();
  }

  return { count, samples };
}

async function countDuplicateKeys(limit = 0) {
  const models = [
    { name: 'SessionState', field: 'sessionId', label: 'SessionState sessionId' },
    { name: 'User', field: 'email', label: 'User email' },
    { name: 'Setting', field: 'key', label: 'Setting key' }
  ];

  let totalCount = 0;
  let allSamples = [];

  for (const m of models) {
    const Model = mongoose.models[m.name];
    if (!Model) continue;

    const pipeline = [
      { $group: { _id: `$${m.field}`, count: { $sum: 1 }, docIds: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit || 10 }
    ];

    const groups = await Model.aggregate(pipeline).allowDiskUse(true).exec();
    for (const g of groups) {
      totalCount++;
      // Format sample as a string for easy display in the existing UI
      allSamples.push(`${m.label}: "${g._id}" (Count: ${g.count})`);
    }
  }

  return { count: totalCount, samples: allSamples.slice(0, limit || 10) };
}

async function databaseIntegrityHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    const { check, limit = 10 } = req.query;
    const l = Number(limit) || 10;

    switch (check) {
      case 'orphanCitations': {
        const out = await countOrphanCitations(l);
        return res.status(200).json({ check, ...out });
      }
      case 'orphanTools': {
        const out = await countOrphanTools(l);
        return res.status(200).json({ check, ...out });
      }
      case 'embeddingsMissingRefs': {
        const out = await countEmbeddingsMissingRefs(l);
        return res.status(200).json({ check, ...out });
      }
      case 'sentenceEmbeddingOrphans': {
        const out = await countSentenceEmbeddingOrphans(l);
        return res.status(200).json({ check, ...out });
      }
      case 'orphanExpertFeedback': {
        const out = await countOrphanExpertFeedback(l);
        return res.status(200).json({ check, ...out });
      }
      case 'orphanPublicFeedback': {
        const out = await countOrphanPublicFeedback(l);
        return res.status(200).json({ check, ...out });
      }
      case 'orphanQuestions': {
        const out = await countOrphanQuestions(l);
        return res.status(200).json({ check, ...out });
      }
      case 'orphanAnswers': {
        const out = await countOrphanAnswers(l);
        return res.status(200).json({ check, ...out });
      }
      case 'evalInvalidInteraction': {
        const out = await countEvalInvalidInteraction(l);
        return res.status(200).json({ check, ...out });
      }
      case 'orphanInteractions': {
        const out = await countOrphanInteractions(l);
        return res.status(200).json({ check, ...out });
      }
      case 'answersMissingEmbedding': {
        const out = await countAnswersMissingEmbedding(l);
        return res.status(200).json({ check, ...out });
      }
      case 'batchItemsMissingBatch': {
        const out = await countBatchItemsMissingBatch(l);
        return res.status(200).json({ check, ...out });
      }
      case 'batchesWithoutItems': {
        const out = await countBatchesWithoutItems(l);
        return res.status(200).json({ check, ...out });
      }
      case 'interactionMissingChildren': {
        const out = await countInteractionMissingChildren(l);
        return res.status(200).json({ check, ...out });
      }
      case 'evalInvalidExpertFeedback': {
        const out = await countEvalInvalidExpertFeedback(l);
        return res.status(200).json({ check, ...out });
      }
      case 'scenarioOverrideMissingUser': {
        const out = await countScenarioOverrideMissingUser(l);
        return res.status(200).json({ check, ...out });
      }
      case 'chatInvalidUser': {
        const out = await countChatInvalidUser(l);
        return res.status(200).json({ check, ...out });
      }
      case 'logsChatIdMissingChat': {
        const out = await countLogsChatIdMissingChat(l);
        return res.status(200).json({ check, ...out });
      }
      case 'sentenceEmbeddingIndexIssues': {
        const out = await countSentenceEmbeddingIndexIssues(l);
        return res.status(200).json({ check, ...out });
      }
      case 'chatInvalidInteractions': {
        const out = await countParentInvalidChildren('Chat', 'interactions', 'interactions', l);
        return res.status(200).json({ check, ...out });
      }
      case 'duplicateKeys': {
        const out = await countDuplicateKeys(l);
        return res.status(200).json({ check, ...out });
      }
      case 'answerInvalidTools': {
        const out = await countParentInvalidChildren('Answer', 'tools', 'tools', l);
        return res.status(200).json({ check, ...out });
      }
      default:
        return res.status(400).json({ message: 'Unknown or missing check param' });
    }
  } catch (error) {
    console.error('Integrity checks error:', error);
    return res.status(500).json({ message: 'Integrity check failed', error: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(databaseIntegrityHandler, authMiddleware, adminMiddleware)(req, res);
}
