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
// turning a maintenance operation into an unbounded write burst. This is
// intentionally configurable because the work is I/O-bound, not CPU-bound.
const configuredBackfillConcurrency = Number.parseInt(
  process.env.EMBEDDING_METADATA_BACKFILL_CONCURRENCY,
  10
);
const BACKFILL_CONCURRENCY = Number.isFinite(configuredBackfillConcurrency)
  ? Math.max(1, Math.min(configuredBackfillConcurrency, 16))
  : 4;
const BACKFILL_CURSOR_SOURCE = 'expertFeedback';

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
    const normalizedPageLanguage = normalizeMatchLanguage(pageLanguage);
    const normalizedInteractionLanguage = normalizeMatchLanguage(interactionLanguage);
    const metadata = feedbackMetadata(feedback);
    let updateFilter = buildUpdateFilter(interaction._id, embeddingId, updateScope);
    if (onlyMissingMetadata) {
      updateFilter = {
        $and: [
          updateFilter,
          { expertFeedbackId: null },
        ],
      };
    }
    const update = {
      ...metadata,
      interactionId: interaction._id,
      pageLanguage: normalizedPageLanguage || undefined,
      interactionLanguage: normalizedInteractionLanguage || undefined,
    };

    const updateResult = await Embedding.updateMany(
      updateFilter,
      { $set: update }
    );
    if (onlyMissingMetadata && updateResult.matchedCount === 0) {
      return {
        ...updateResult,
        skippedReason: 'metadataAlreadyComplete',
        metadataSnapshot: {
          interactionId: toIdString(interaction._id),
          expertFeedbackId: toIdString(metadata.expertFeedbackId),
          expertFeedbackTotalScore: metadata.expertFeedbackTotalScore,
          expertFeedbackCreatedAt: metadata.expertFeedbackCreatedAt || null,
          expertFeedbackNeverStale: metadata.expertFeedbackNeverStale,
          pageLanguage: normalizedPageLanguage || null,
          interactionLanguage: normalizedInteractionLanguage || null,
        },
        feedbackType: normalizeFeedbackType(feedback),
      };
    }
    return {
      ...updateResult,
      metadataAction: 'updated',
      metadataSnapshot: {
        interactionId: toIdString(interaction._id),
        expertFeedbackId: toIdString(metadata.expertFeedbackId),
        expertFeedbackTotalScore: metadata.expertFeedbackTotalScore,
        expertFeedbackCreatedAt: metadata.expertFeedbackCreatedAt || null,
        expertFeedbackNeverStale: metadata.expertFeedbackNeverStale,
        pageLanguage: normalizedPageLanguage || null,
        interactionLanguage: normalizedInteractionLanguage || null,
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
    const aggregation = Embedding.aggregate([
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
    // Production uses secondaryPreferred for general reads. Status must read
    // from the primary so it reflects the metadata writes immediately.
    if (typeof aggregation.read === 'function') aggregation.read('primary');
    const [summary = {}] = await aggregation;

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

  async backfillMissingBatch({ lastProcessedId = null, limit = 100, includeDetails = false } = {}) {
    lastProcessedId = normalizeObjectId(lastProcessedId);
    const feedbackQuery = {
      ...(lastProcessedId ? { _id: { $gt: lastProcessedId } } : {}),
    };
    const scanLimit = Math.max(1, limit);
    const feedbacks = await ExpertFeedback.find(feedbackQuery)
      .sort({ _id: 1 })
      .limit(scanLimit)
      .select('_id totalScore type neverStale createdAt')
      .lean();

    const feedbackIds = feedbacks.map(({ _id }) => _id).filter(Boolean);
    const interactions = feedbackIds.length
      ? await Interaction.find({ expertFeedback: { $in: feedbackIds } })
        .select('_id expertFeedback question')
        .populate({ path: 'question', select: 'language' })
        .lean()
      : [];
    const feedbackById = new Map(
      feedbacks.map((feedback) => [toIdString(feedback._id), feedback])
    );
    const interactionsWithFeedback = interactions.map((interaction) => ({
      ...interaction,
      expertFeedback: feedbackById.get(toIdString(interaction.expertFeedback)) || interaction.expertFeedback,
    }));

    const interactionIds = interactionsWithFeedback.map(({ _id }) => _id).filter(Boolean);
    const missingEmbeddings = interactionIds.length
      ? await Embedding.find({
        interactionId: { $in: interactionIds },
        // Equality to null matches both null and absent fields. Populated
        // embeddings are discarded by DocumentDB before their vectors load.
        expertFeedbackId: null,
      })
        .select('_id interactionId chatId')
        .populate({ path: 'chatId', select: 'pageLanguage' })
        .lean()
      : [];
    const missingEmbeddingsByInteractionId = new Map();
    for (const embedding of missingEmbeddings) {
      const key = toIdString(embedding.interactionId);
      if (!missingEmbeddingsByInteractionId.has(key)) {
        missingEmbeddingsByInteractionId.set(key, []);
      }
      missingEmbeddingsByInteractionId.get(key).push(embedding);
    }
    const interactionsByFeedbackId = new Map();
    for (const interaction of interactionsWithFeedback) {
      const key = toIdString(interaction.expertFeedback?._id || interaction.expertFeedback);
      if (!interactionsByFeedbackId.has(key)) interactionsByFeedbackId.set(key, []);
      interactionsByFeedbackId.get(key).push(interaction);
    }

    let selectedInteraction = null;
    let selectedEmbeddings = [];
    let selectedFeedbackIndex = -1;
    for (const [index, feedback] of feedbacks.entries()) {
      const linkedInteractions = interactionsByFeedbackId.get(toIdString(feedback._id)) || [];
      selectedInteraction = linkedInteractions.find((interaction) =>
        missingEmbeddingsByInteractionId.has(toIdString(interaction._id))
      ) || null;
      if (selectedInteraction) {
        selectedEmbeddings = missingEmbeddingsByInteractionId.get(
          toIdString(selectedInteraction._id)
        );
        selectedFeedbackIndex = index;
        break;
      }
    }

    let result = null;
    if (selectedInteraction) {
      const chat = selectedEmbeddings.find(
        (embedding) => embedding.chatId && typeof embedding.chatId === 'object'
      )?.chatId;
      result = await this.syncForInteraction(selectedInteraction, null, {
        updateScope: 'interaction',
        onlyMissingMetadata: true,
        pageLanguageOverride: chat?.pageLanguage || null,
      });
    }

    let updated = 0;
    let cleared = 0;
    let skipped = 0;
    let action = null;
    let reason = null;
    if (result?.skippedReason) {
      skipped = 1;
      action = 'skipped';
      reason = result.skippedReason;
    } else if (result?.metadataAction === 'cleared') {
      cleared = 1;
      action = 'cleared';
      reason = result.clearReason || null;
    } else if (result) {
      updated = 1;
      action = 'updated';
    }

    const selectedFeedback = selectedFeedbackIndex >= 0
      ? feedbacks[selectedFeedbackIndex]
      : null;
    const lastScannedFeedback = feedbacks.length
      ? feedbacks[feedbacks.length - 1]
      : null;
    const lastId = toIdString(selectedFeedback?._id || lastScannedFeedback?._id)
      || lastProcessedId;
    const hasMore = selectedFeedbackIndex >= 0
      ? selectedFeedbackIndex < feedbacks.length - 1 || feedbacks.length === scanLimit
      : feedbacks.length === scanLimit;
    const batchRecords = [];
    if (includeDetails && result) {
      batchRecords.push({
        embeddingId: toIdString(selectedEmbeddings[0]?._id),
        storedInteractionId: toIdString(selectedEmbeddings[0]?.interactionId),
        resolvedInteractionId: toIdString(selectedInteraction?._id),
        action,
        reason,
        feedbackType: result.feedbackType || null,
        metadata: result.metadataSnapshot || null,
        modifiedCount: result.modifiedCount || 0,
      });
    }

    return {
      phase: 'missing',
      cursorSource: BACKFILL_CURSOR_SOURCE,
      processed: result ? 1 : 0,
      updated,
      cleared,
      skipped,
      remaining: null,
      hasMore,
      lastProcessedId: lastId,
      scannedFeedbackCount: feedbacks.length,
      scannedBeforeCandidate: selectedFeedbackIndex >= 0 ? selectedFeedbackIndex : null,
      ...(includeDetails ? { batchRecords } : {}),
    };
  }

  async backfillBatch({ lastProcessedId = null, limit = 100, includeDetails = false, phase = 'clear' } = {}) {
    if (phase === 'clear') {
      const clearResult = await this.clearAllMetadata();
      return {
        phase: 'interactions',
        cursorSource: BACKFILL_CURSOR_SOURCE,
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

    if (phase === 'missing') {
      return this.backfillMissingBatch({ lastProcessedId, limit, includeDetails });
    }

    lastProcessedId = normalizeObjectId(lastProcessedId);
    const feedbackQuery = {
      ...(lastProcessedId ? { _id: { $gt: lastProcessedId } } : {}),
    };
    // Page from ExpertFeedback rather than Interaction. Interactions with expert
    // feedback are sparse in production, so filtering them while sorting by the
    // Interaction _id can scan a large part of the collection for every page.
    // Both reads below are served by their leading ObjectId indexes.
    const feedbacks = await ExpertFeedback.find(feedbackQuery)
      .sort({ _id: 1 })
      .limit(limit)
      .select('_id totalScore type neverStale createdAt')
      .lean();
    const feedbackIds = feedbacks.map(({ _id }) => _id).filter(Boolean);
    const interactions = feedbackIds.length
      ? await Interaction.find({ expertFeedback: { $in: feedbackIds } })
        .select('_id expertFeedback question')
        .populate({ path: 'question', select: 'language' })
        .lean()
      : [];
    const feedbackById = new Map(
      feedbacks.map((feedback) => [toIdString(feedback._id), feedback])
    );
    const interactionsWithFeedback = interactions.map((interaction) => ({
      ...interaction,
      expertFeedback: feedbackById.get(toIdString(interaction.expertFeedback)) || interaction.expertFeedback,
    }));

    // Resolve page languages through the embedding's indexed chatId reference.
    // Avoid reverse-scanning Chat.interactions, which is expensive on DocumentDB
    // and can return very large interaction arrays.
    const interactionIds = interactionsWithFeedback.map(({ _id }) => _id).filter(Boolean);
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

    const results = await mapWithConcurrency(interactionsWithFeedback, BACKFILL_CONCURRENCY, (interaction) =>
      this.syncForInteraction(interaction, null, {
        onlyMissingMetadata: phase === 'missing',
        pageLanguageOverride: pageLanguagesByInteractionId.get(toIdString(interaction._id)) ?? null,
      })
    );

    for (const [index, interaction] of interactionsWithFeedback.entries()) {
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
    lastId = feedbacks.length ? feedbacks[feedbacks.length - 1]._id.toString() : lastId;
    const hasMore = feedbacks.length === limit;
    return {
      phase,
      cursorSource: BACKFILL_CURSOR_SOURCE,
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
