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
  async syncForInteraction(interactionOrId, feedbackOrId = null, { clearWhenMissingFeedback = true, embeddingId = null } = {}) {
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
      return clearWhenMissingFeedback
        ? this.clearForInteraction(interaction._id, { embeddingId })
        : { matchedCount: 0, modifiedCount: 0, skippedReason: 'missingFeedback' };
    }

    const feedback = typeof feedbackId === 'object' && feedbackId?._id
      ? feedbackId
      : normalizedFeedbackId
        ? await ExpertFeedback.findById(normalizedFeedbackId).lean()
        : null;
    if (!feedback?._id) {
      return clearWhenMissingFeedback
        ? this.clearForInteraction(interaction._id, { embeddingId })
        : { matchedCount: 0, modifiedCount: 0, skippedReason: 'missingFeedbackDocument' };
    }

    const pageLanguage = await getPageLanguage(interaction._id);
    const interactionLanguage = await getInteractionLanguage(interaction, interaction._id);
    const metadata = feedbackMetadata(feedback);
    const normalizedEmbeddingId = normalizeObjectId(embeddingId);
    const updateFilter = normalizedEmbeddingId
      ? { $or: [{ _id: normalizedEmbeddingId }, { interactionId: interaction._id }] }
      : { interactionId: interaction._id };
    const update = {
      ...metadata,
      interactionId: interaction._id,
      pageLanguage: pageLanguage || undefined,
      interactionLanguage: normalizeMatchLanguage(interactionLanguage) || undefined,
    };

    return Embedding.updateMany(
      updateFilter,
      { $set: update }
    );
  }

  async clearForInteraction(interactionId, { embeddingId = null } = {}) {
    interactionId = normalizeObjectId(interactionId);
    if (!interactionId) return { matchedCount: 0, modifiedCount: 0 };
    const normalizedEmbeddingId = normalizeObjectId(embeddingId);
    const updateFilter = normalizedEmbeddingId
      ? { $or: [{ _id: normalizedEmbeddingId }, { interactionId }] }
      : { interactionId };

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

  async backfillBatch({ lastProcessedId = null, limit = 100 } = {}) {
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

    for (const embedding of embeddings) {
      lastId = embedding._id.toString();
      const interaction = await findInteractionByEmbedding(embedding);
      if (!interaction) {
        skipped += 1;
        continue;
      }
      const result = await this.syncForInteraction(interaction, null, {
        embeddingId: embedding._id,
      });
      if (result.skippedReason) {
        skipped += 1;
      } else if (interaction.expertFeedback) {
        updated += result.modifiedCount || 0;
      } else {
        cleared += result.modifiedCount || 0;
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
    };
  }
}

export default new EmbeddingMetadataService();
