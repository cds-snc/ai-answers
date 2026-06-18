import { normalizeObjectId } from '../api/util/db-query.js';
import { Chat } from '../models/chat.js';
import { Embedding } from '../models/embedding.js';
import { ExpertFeedback } from '../models/expertFeedback.js';
import { Interaction } from '../models/interaction.js';

function feedbackMetadata(feedback) {
  if (!feedback) return null;
  return {
    expertFeedbackId: feedback._id,
    expertFeedbackTotalScore: typeof feedback.totalScore === 'number' ? feedback.totalScore : null,
    expertFeedbackCreatedAt: feedback.createdAt || null,
    expertFeedbackNeverStale: feedback.neverStale === true || String(feedback.neverStale) === 'true',
  };
}

function isAutoEvalFeedback(feedback) {
  if (!feedback || typeof feedback !== 'object') return false;
  return String(feedback.type || '').trim().toLowerCase() === 'ai';
}

function normalizeFeedbackType(feedback) {
  if (!feedback || typeof feedback !== 'object') return null;
  const type = String(feedback.type || '').trim().toLowerCase();
  return type || null;
}

function toIdString(value) {
  if (!value) return null;
  return String(value);
}

function buildClearedSnapshot(interactionId) {
  return {
    interactionId: toIdString(interactionId),
    expertFeedbackId: null,
    expertFeedbackTotalScore: null,
    expertFeedbackCreatedAt: null,
    expertFeedbackNeverStale: null,
    pageLanguage: null,
    interactionLanguage: null,
  };
}

function buildUpdateFilter(interactionId, embeddingId = null, updateScope = 'interaction') {
  const normalizedEmbeddingId = normalizeObjectId(embeddingId);
  if (updateScope === 'embedding' && normalizedEmbeddingId) {
    return { _id: normalizedEmbeddingId };
  }

  if (normalizedEmbeddingId) {
    return {
      $or: [{ _id: normalizedEmbeddingId }, { interactionId }],
    };
  }

  return { interactionId };
}

function normalizeMatchLanguage(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith('fr') || normalized.includes('french')) return 'fr';
  if (normalized.startsWith('en') || normalized.includes('english')) return 'en';
  return normalized;
}

async function getPageLanguage(interactionId, fallbackChatId = null) {
  interactionId = normalizeObjectId(interactionId);
  fallbackChatId = normalizeObjectId(fallbackChatId);
  if (!interactionId && !fallbackChatId) return null;

  const query = fallbackChatId
    ? { $or: [{ _id: fallbackChatId }, { interactions: interactionId }] }
    : { interactions: interactionId };
  const chat = await Chat.findOne(query).select('pageLanguage').lean();
  return chat?.pageLanguage || null;
}

async function getInteractionLanguage(interactionOrId, fallbackChatId = null) {
  const rawInteractionId = typeof interactionOrId === 'object' && interactionOrId?._id
    ? interactionOrId._id
    : interactionOrId;
  const interactionId = normalizeObjectId(rawInteractionId);
  const chatId = normalizeObjectId(fallbackChatId);
  if (!interactionId && !chatId) return null;

  const hasQuestionLanguage = typeof interactionOrId === 'object'
    && interactionOrId
    && typeof interactionOrId.question === 'object'
    && interactionOrId.question
    && typeof interactionOrId.question.language === 'string'
    && interactionOrId.question.language.trim().length;

  const interaction = hasQuestionLanguage
    ? interactionOrId
    : interactionId
      ? await Interaction.findById(interactionId)
        .select('_id question')
        .populate({ path: 'question', select: 'language' })
        .lean()
      : null;

  const normalized = normalizeMatchLanguage(interaction?.question?.language);
  if (normalized) return normalized;

  if (chatId) {
    const chat = await Chat.findOne({ _id: chatId }).select('pageLanguage').lean();
    return chat?.pageLanguage || null;
  }

  return null;
}

async function findInteractionByEmbedding(embedding) {
  const interactionId = normalizeObjectId(embedding?.interactionId);
  const interactionQuery = '_id expertFeedback question';
  const populateQuestion = { path: 'question', select: 'language' };
  if (interactionId) {
    const interaction = await Interaction.findById(interactionId)
      .select(interactionQuery)
      .populate(populateQuestion)
      .lean();
    if (interaction) return interaction;
  }

  const questionId = normalizeObjectId(embedding?.questionId);
  const answerId = normalizeObjectId(embedding?.answerId);
  if (!questionId || !answerId) return null;

  const chatId = normalizeObjectId(embedding?.chatId);
  const chat = chatId
    ? await Chat.findOne({ _id: chatId }).select('interactions').lean()
    : null;
  const fallbackQuery = {
    question: questionId,
    answer: answerId,
    ...(chat?.interactions?.length ? { _id: { $in: chat.interactions } } : {}),
  };

  return Interaction.findOne(fallbackQuery)
    .select(interactionQuery)
    .populate(populateQuestion)
    .lean();
}

class EmbeddingMetadataService {
  async syncForInteraction(interactionOrId, feedbackOrId = null, {
    clearWhenMissingFeedback = true,
    embeddingId = null,
    updateScope = 'interaction',
  } = {}) {
    const interactionId = normalizeObjectId(interactionOrId);
    const interaction = typeof interactionOrId === 'object' && interactionOrId?._id
      ? interactionOrId
      : interactionId
        ? await Interaction.findById(interactionId).select('_id expertFeedback question').populate({ path: 'question', select: 'language' }).lean()
        : null;
    if (!interaction?._id) return { matchedCount: 0, modifiedCount: 0 };

    const feedbackId = feedbackOrId || interaction.expertFeedback;
    const normalizedFeedbackId = normalizeObjectId(feedbackId);
    if (!feedbackId) {
      if (clearWhenMissingFeedback) {
        const clearResult = await this.clearForInteraction(interaction._id, { embeddingId, updateScope });
        return {
          ...clearResult,
          metadataAction: 'cleared',
          clearReason: 'missingFeedback',
          metadataSnapshot: buildClearedSnapshot(interaction._id),
          feedbackType: null,
        };
      }
      return {
        matchedCount: 0,
        modifiedCount: 0,
        skippedReason: 'missingFeedback',
      };
    }

    const feedback = typeof feedbackId === 'object' && feedbackId?._id
      ? feedbackId
      : normalizedFeedbackId
        ? await ExpertFeedback.findById(normalizedFeedbackId).lean()
        : null;
    if (!feedback?._id) {
      if (clearWhenMissingFeedback) {
        const clearResult = await this.clearForInteraction(interaction._id, { embeddingId, updateScope });
        return {
          ...clearResult,
          metadataAction: 'cleared',
          clearReason: 'missingFeedbackDocument',
          metadataSnapshot: buildClearedSnapshot(interaction._id),
          feedbackType: null,
        };
      }
      return {
        matchedCount: 0,
        modifiedCount: 0,
        skippedReason: 'missingFeedbackDocument',
      };
    }

    // Auto-eval feedback must not be denormalized onto retrieval embeddings.
    if (isAutoEvalFeedback(feedback)) {
      const clearResult = await this.clearForInteraction(interaction._id, { embeddingId, updateScope });
      return {
        ...clearResult,
        metadataAction: 'cleared',
        clearReason: 'autoEvalFeedback',
        metadataSnapshot: buildClearedSnapshot(interaction._id),
        feedbackType: normalizeFeedbackType(feedback),
      };
    }

    const pageLanguage = await getPageLanguage(interaction._id);
    const interactionLanguage = await getInteractionLanguage(interaction, interaction._id);
    const metadata = feedbackMetadata(feedback);
    const updateFilter = buildUpdateFilter(interaction._id, embeddingId, updateScope);
    const update = {
      ...metadata,
      interactionId: interaction._id,
      pageLanguage: pageLanguage || undefined,
      interactionLanguage: normalizeMatchLanguage(interactionLanguage) || undefined,
    };

    const updateResult = await Embedding.updateMany(
      updateFilter,
      { $set: update }
    );
    return {
      ...updateResult,
      metadataAction: 'updated',
      metadataSnapshot: {
        interactionId: toIdString(interaction._id),
        expertFeedbackId: toIdString(metadata.expertFeedbackId),
        expertFeedbackTotalScore: metadata.expertFeedbackTotalScore,
        expertFeedbackCreatedAt: metadata.expertFeedbackCreatedAt || null,
        expertFeedbackNeverStale: metadata.expertFeedbackNeverStale,
        pageLanguage: pageLanguage || null,
        interactionLanguage: normalizeMatchLanguage(interactionLanguage) || null,
      },
      feedbackType: normalizeFeedbackType(feedback),
    };
  }

  async clearForInteraction(interactionId, { embeddingId = null, updateScope = 'interaction' } = {}) {
    interactionId = normalizeObjectId(interactionId);
    if (!interactionId) return { matchedCount: 0, modifiedCount: 0 };
    const updateFilter = buildUpdateFilter(interactionId, embeddingId, updateScope);

    return Embedding.updateMany(
      updateFilter,
      {
        $set: {
          interactionId,
        },
        $unset: {
          expertFeedbackId: '',
          expertFeedbackTotalScore: '',
          expertFeedbackCreatedAt: '',
          expertFeedbackNeverStale: '',
          interactionLanguage: '',
        },
      }
    );
  }

  async backfillBatch({ lastProcessedId = null, limit = 100, includeDetails = false } = {}) {
    lastProcessedId = normalizeObjectId(lastProcessedId);
    const query = lastProcessedId ? { _id: { $gt: lastProcessedId } } : {};
    const embeddings = await Embedding.find(query)
      .sort({ _id: 1 })
      .limit(limit)
      .select('_id chatId interactionId questionId answerId')
      .lean();

    let updated = 0;
    let cleared = 0;
    let skipped = 0;
    let lastId = lastProcessedId || null;
    const batchRecords = [];

    for (const embedding of embeddings) {
      lastId = embedding._id.toString();
      const interaction = await findInteractionByEmbedding(embedding);
      if (!interaction) {
        skipped += 1;
        if (includeDetails) {
          batchRecords.push({
            embeddingId: toIdString(embedding._id),
            storedInteractionId: toIdString(embedding.interactionId),
            resolvedInteractionId: null,
            action: 'skipped',
            reason: 'interactionNotFound',
            feedbackType: null,
            metadata: null,
            modifiedCount: 0,
          });
        }
        continue;
      }
      const result = await this.syncForInteraction(interaction, null, {
        embeddingId: embedding._id,
        updateScope: 'embedding',
      });
      if (result.skippedReason) {
        skipped += 1;
        if (includeDetails) {
          batchRecords.push({
            embeddingId: toIdString(embedding._id),
            storedInteractionId: toIdString(embedding.interactionId),
            resolvedInteractionId: toIdString(interaction._id),
            action: 'skipped',
            reason: result.skippedReason,
            feedbackType: result.feedbackType || null,
            metadata: result.metadataSnapshot || null,
            modifiedCount: result.modifiedCount || 0,
          });
        }
      } else if (result.metadataAction === 'cleared') {
        // count the embedding row that was cleared (one per embedding processed)
        cleared += 1;
        if (includeDetails) {
          batchRecords.push({
            embeddingId: toIdString(embedding._id),
            storedInteractionId: toIdString(embedding.interactionId),
            resolvedInteractionId: toIdString(interaction._id),
            action: 'cleared',
            reason: result.clearReason || null,
            feedbackType: result.feedbackType || null,
            metadata: result.metadataSnapshot || null,
            modifiedCount: result.modifiedCount || 0,
          });
        }
      } else {
        // count the embedding row that was updated (one per embedding processed)
        updated += 1;
        if (includeDetails) {
          batchRecords.push({
            embeddingId: toIdString(embedding._id),
            storedInteractionId: toIdString(embedding.interactionId),
            resolvedInteractionId: toIdString(interaction._id),
            action: 'updated',
            reason: null,
            feedbackType: result.feedbackType || null,
            metadata: result.metadataSnapshot || null,
            modifiedCount: result.modifiedCount || 0,
          });
        }
      }
    }

    const remainingQuery = lastId ? { _id: { $gt: lastId } } : {};
    const remaining = await Embedding.countDocuments(remainingQuery);
    return {
      processed: embeddings.length,
      updated,
      cleared,
      skipped,
      remaining,
      lastProcessedId: lastId,
      ...(includeDetails ? { batchRecords } : {}),
    };
  }
}

export default new EmbeddingMetadataService();
