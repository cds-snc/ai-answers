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

const METADATA_UNSET = {
  expertFeedbackId: '',
  expertFeedbackTotalScore: '',
  expertFeedbackCreatedAt: '',
  expertFeedbackNeverStale: '',
  pageLanguage: '',
  interactionLanguage: '',
};

// Keep enough work in flight to hide DocumentDB round-trip latency without
// turning a maintenance operation into an unbounded write burst.
const BACKFILL_CONCURRENCY = 4;

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
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

function looksLikeExpertFeedbackDocument(feedback) {
  if (!feedback || typeof feedback !== 'object') return false;
  return ['totalScore', 'type', 'neverStale', 'createdAt'].some((key) =>
    Object.prototype.hasOwnProperty.call(feedback, key)
  );
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

class EmbeddingMetadataService {
  async syncForInteraction(interactionOrId, feedbackOrId = null, {
    clearWhenMissingFeedback = true,
    embeddingId = null,
    updateScope = 'interaction',
    onlyMissingMetadata = false,
    pageLanguageOverride,
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

    const feedback = looksLikeExpertFeedbackDocument(feedbackId)
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

    const pageLanguage = pageLanguageOverride !== undefined
      ? pageLanguageOverride
      : await getPageLanguage(interaction._id);
    const interactionLanguage = await getInteractionLanguage(interaction, interaction._id);
    const metadata = feedbackMetadata(feedback);
    let updateFilter = buildUpdateFilter(interaction._id, embeddingId, updateScope);
    if (onlyMissingMetadata) {
      updateFilter = {
        $and: [
          updateFilter,
          { $or: Object.keys(METADATA_UNSET).flatMap((field) => [
            { [field]: { $exists: false } },
            { [field]: null },
          ]) },
        ],
      };
    }
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
        $unset: METADATA_UNSET,
      }
    );
  }

  async clearAllMetadata() {
    return Embedding.updateMany({}, { $unset: METADATA_UNSET });
  }

  async getBackfillStatus() {
    const [summary = {}] = await Embedding.aggregate([
      {
        $lookup: {
          from: 'interactions',
          localField: 'interactionId',
          foreignField: '_id',
          as: 'interaction',
        },
      },
      { $unwind: { path: '$interaction', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'expertfeedbacks',
          localField: 'interaction.expertFeedback',
          foreignField: '_id',
          as: 'feedback',
        },
      },
      { $unwind: { path: '$feedback', preserveNullAndEmptyArrays: true } },
      {
        $set: {
          requiresMetadata: {
            $and: [
              { $ne: [{ $ifNull: ['$feedback._id', null] }, null] },
              { $ne: [{ $ifNull: ['$feedback.type', ''] }, 'ai'] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalEmbeddings: { $sum: 1 },
          recordsRequiringMetadata: { $sum: { $cond: ['$requiresMetadata', 1, 0] } },
          recordsWithMetadata: {
            $sum: { $cond: [{ $ne: [{ $ifNull: ['$expertFeedbackId', null] }, null] }, 1, 0] },
          },
          recordsMissingMetadata: {
            $sum: {
              $cond: [
                { $and: ['$requiresMetadata', { $eq: [{ $ifNull: ['$expertFeedbackId', null] }, null] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const totalEmbeddings = summary.totalEmbeddings || 0;
    const recordsRequiringMetadata = summary.recordsRequiringMetadata || 0;
    const recordsWithMetadata = summary.recordsWithMetadata || 0;
    const recordsMissingMetadata = summary.recordsMissingMetadata || 0;

    return {
      complete: recordsMissingMetadata === 0,
      checkedAt: new Date().toISOString(),
      totalEmbeddings,
      recordsRequiringMetadata,
      recordsWithMetadata,
      recordsMissingMetadata,
    };
  }

  async backfillBatch({ lastProcessedId = null, limit = 100, includeDetails = false, phase = 'clear' } = {}) {
    if (phase === 'clear') {
      const clearResult = await this.clearAllMetadata();
      return {
        phase: 'interactions',
        processed: clearResult.matchedCount || 0,
        updated: 0,
        cleared: clearResult.modifiedCount || 0,
        skipped: 0,
        remaining: null,
        hasMore: true,
        lastProcessedId: null,
        ...(includeDetails ? {
          batchRecords: [{
            embeddingId: null,
            storedInteractionId: null,
            resolvedInteractionId: null,
            action: 'cleared',
            reason: 'allMetadataReset',
            feedbackType: null,
            metadata: buildClearedSnapshot(null),
            modifiedCount: clearResult.modifiedCount || 0,
          }],
        } : {}),
      };
    }

    lastProcessedId = normalizeObjectId(lastProcessedId);
    const query = {
      expertFeedback: { $exists: true, $ne: null },
      ...(lastProcessedId ? { _id: { $gt: lastProcessedId } } : {}),
    };
    const interactions = await Interaction.find(query)
      .sort({ _id: 1 })
      .limit(limit)
      .select('_id expertFeedback question')
      .populate([
        { path: 'expertFeedback', select: 'totalScore type neverStale createdAt' },
        { path: 'question', select: 'language' },
      ])
      .lean();

    // Resolve page languages through the embedding's indexed chatId reference.
    // Avoid reverse-scanning Chat.interactions, which is expensive on DocumentDB
    // and can return very large interaction arrays.
    const interactionIds = interactions.map(({ _id }) => _id).filter(Boolean);
    const embeddingChatLinks = interactionIds.length
      ? await Embedding.find({ interactionId: { $in: interactionIds } })
        .select('interactionId chatId')
        .populate({ path: 'chatId', select: 'pageLanguage' })
        .lean()
      : [];
    const pageLanguagesByInteractionId = new Map(
      interactionIds.map((interactionId) => [toIdString(interactionId), null])
    );
    for (const embedding of embeddingChatLinks) {
      const key = toIdString(embedding.interactionId);
      if (pageLanguagesByInteractionId.has(key) && embedding.chatId && typeof embedding.chatId === 'object') {
        pageLanguagesByInteractionId.set(key, embedding.chatId.pageLanguage || null);
      }
    }

    let updated = 0;
    let cleared = 0;
    let skipped = 0;
    let lastId = lastProcessedId || null;
    const batchRecords = [];

    const results = await mapWithConcurrency(interactions, BACKFILL_CONCURRENCY, (interaction) =>
      this.syncForInteraction(interaction, null, {
        onlyMissingMetadata: phase === 'missing',
        pageLanguageOverride: pageLanguagesByInteractionId.get(toIdString(interaction._id)) ?? null,
      })
    );

    for (const [index, interaction] of interactions.entries()) {
      lastId = interaction._id.toString();
      const result = results[index];
      if (result.skippedReason) {
        skipped += 1;
        if (includeDetails) {
          batchRecords.push({
            embeddingId: null,
            storedInteractionId: toIdString(interaction._id),
            resolvedInteractionId: toIdString(interaction._id),
            action: 'skipped',
            reason: result.skippedReason,
            feedbackType: result.feedbackType || null,
            metadata: result.metadataSnapshot || null,
            modifiedCount: result.modifiedCount || 0,
          });
        }
      } else if (result.metadataAction === 'cleared') {
        cleared += 1;
        if (includeDetails) {
          batchRecords.push({
            embeddingId: null,
            storedInteractionId: toIdString(interaction._id),
            resolvedInteractionId: toIdString(interaction._id),
            action: 'cleared',
            reason: result.clearReason || null,
            feedbackType: result.feedbackType || null,
            metadata: result.metadataSnapshot || null,
            modifiedCount: result.modifiedCount || 0,
          });
        }
      } else {
        updated += 1;
        if (includeDetails) {
          batchRecords.push({
            embeddingId: null,
            storedInteractionId: toIdString(interaction._id),
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

    // Avoid a collection-wide count on every page. A full page means there
    // may be another page; the client will make one final empty request when
    // the total happens to be an exact multiple of the batch size.
    const hasMore = interactions.length === limit;
    return {
      phase,
      processed: interactions.length,
      updated,
      cleared,
      skipped,
      remaining: null,
      hasMore,
      lastProcessedId: lastId,
      ...(includeDetails ? { batchRecords } : {}),
    };
  }

  async lookupForChat(chatId) {
    if (!chatId || typeof chatId !== 'string') {
      return { chat: null, rows: [] };
    }

    const chat = await Chat.findOne({ chatId })
      .select('_id chatId pageLanguage interactions')
      .populate({
        path: 'interactions',
        select: '_id interactionId expertFeedback question',
        populate: [
          { path: 'expertFeedback', select: 'totalScore type neverStale createdAt' },
          { path: 'question', select: 'language' },
        ],
      })
      .lean();
    if (!chat) return { chat: null, rows: [] };

    const interactions = Array.isArray(chat.interactions) ? chat.interactions : [];
    const interactionIds = interactions.map((interaction) => interaction._id).filter(Boolean);
    const embeddings = interactionIds.length
      ? await Embedding.find({ interactionId: { $in: interactionIds } })
        .select('_id interactionId expertFeedbackId expertFeedbackTotalScore expertFeedbackCreatedAt expertFeedbackNeverStale pageLanguage interactionLanguage')
        .sort({ interactionId: 1, _id: 1 })
        .lean()
      : [];

    const embeddingsByInteractionId = new Map();
    for (const embedding of embeddings) {
      const key = toIdString(embedding.interactionId);
      if (!embeddingsByInteractionId.has(key)) embeddingsByInteractionId.set(key, []);
      embeddingsByInteractionId.get(key).push(embedding);
    }

    const rows = interactions.flatMap((interaction, index) => {
      const interactionObjectId = toIdString(interaction._id);
      const attachedFeedback = interaction.expertFeedback && typeof interaction.expertFeedback === 'object'
        ? interaction.expertFeedback
        : null;
      const attachedFeedbackId = toIdString(attachedFeedback?._id || interaction.expertFeedback);
      const matchingEmbeddings = embeddingsByInteractionId.get(interactionObjectId) || [];
      const base = {
        rowNumber: index + 1,
        chatId: chat.chatId,
        chatObjectId: toIdString(chat._id),
        chatPageLanguage: chat.pageLanguage || null,
        interactionObjectId,
        interactionDisplayId: interaction.interactionId || null,
        interactionLanguage: normalizeMatchLanguage(interaction.question?.language) || interaction.question?.language || null,
        attachedExpertFeedbackId: attachedFeedbackId,
        attachedExpertFeedbackType: normalizeFeedbackType(attachedFeedback),
        attachedExpertFeedbackTotalScore: typeof attachedFeedback?.totalScore === 'number' ? attachedFeedback.totalScore : null,
        attachedExpertFeedbackNeverStale: attachedFeedback?.neverStale === true,
      };

      if (!matchingEmbeddings.length) {
        return [{
          ...base,
          embeddingId: null,
          embeddingInteractionId: null,
          metadataExpertFeedbackId: null,
          metadataExpertFeedbackTotalScore: null,
          metadataExpertFeedbackCreatedAt: null,
          metadataExpertFeedbackNeverStale: null,
          metadataPageLanguage: null,
          metadataInteractionLanguage: null,
          metadataStatus: 'missingEmbedding',
        }];
      }

      return matchingEmbeddings.map((embedding) => {
        const metadataFeedbackId = toIdString(embedding.expertFeedbackId);
        let metadataStatus = 'metadataMatches';
        if (!attachedFeedbackId && metadataFeedbackId) {
          metadataStatus = 'unexpectedMetadata';
        } else if (attachedFeedbackId && !metadataFeedbackId) {
          metadataStatus = 'missingMetadata';
        } else if (attachedFeedbackId && metadataFeedbackId && attachedFeedbackId !== metadataFeedbackId) {
          metadataStatus = 'staleFeedbackId';
        }

        return {
          ...base,
          embeddingId: toIdString(embedding._id),
          embeddingInteractionId: toIdString(embedding.interactionId),
          metadataExpertFeedbackId: metadataFeedbackId,
          metadataExpertFeedbackTotalScore: typeof embedding.expertFeedbackTotalScore === 'number'
            ? embedding.expertFeedbackTotalScore
            : null,
          metadataExpertFeedbackCreatedAt: embedding.expertFeedbackCreatedAt || null,
          metadataExpertFeedbackNeverStale: embedding.expertFeedbackNeverStale === true,
          metadataPageLanguage: embedding.pageLanguage || null,
          metadataInteractionLanguage: embedding.interactionLanguage || null,
          metadataStatus,
        };
      });
    });

    return {
      chat: {
        _id: toIdString(chat._id),
        chatId: chat.chatId,
        pageLanguage: chat.pageLanguage || null,
        interactionCount: interactions.length,
        embeddingCount: embeddings.length,
      },
      rows,
    };
  }
}

export default new EmbeddingMetadataService();
