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

class EmbeddingMetadataService {
  async syncForInteraction(interactionOrId, feedbackOrId = null) {
    const interactionId = normalizeObjectId(interactionOrId);
    const interaction = typeof interactionOrId === 'object' && interactionOrId?._id
      ? interactionOrId
      : interactionId
        ? await Interaction.findById(interactionId).select('_id expertFeedback').lean()
        : null;
    if (!interaction?._id) return { matchedCount: 0, modifiedCount: 0 };

    const feedbackId = feedbackOrId || interaction.expertFeedback;
    const normalizedFeedbackId = normalizeObjectId(feedbackId);
    if (!feedbackId) return this.clearForInteraction(interaction._id);

    const feedback = typeof feedbackId === 'object' && feedbackId?._id
      ? feedbackId
      : normalizedFeedbackId
        ? await ExpertFeedback.findById(normalizedFeedbackId).lean()
        : null;
    if (!feedback?._id) return this.clearForInteraction(interaction._id);

    const pageLanguage = await getPageLanguage(interaction._id);
    const metadata = feedbackMetadata(feedback);
    const update = {
      ...metadata,
      pageLanguage: pageLanguage || undefined,
    };

    return Embedding.updateOne(
      { interactionId: interaction._id },
      { $set: update }
    );
  }

  async clearForInteraction(interactionId) {
    interactionId = normalizeObjectId(interactionId);
    if (!interactionId) return { matchedCount: 0, modifiedCount: 0 };

    return Embedding.updateOne(
      { interactionId },
      {
        $unset: {
          expertFeedbackId: '',
          expertFeedbackTotalScore: '',
          expertFeedbackCreatedAt: '',
          expertFeedbackNeverStale: '',
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
      .select('_id interactionId')
      .lean();

    let updated = 0;
    let cleared = 0;
    let skipped = 0;
    let lastId = lastProcessedId || null;

    for (const embedding of embeddings) {
      lastId = embedding._id.toString();
      const interaction = await Interaction.findById(embedding.interactionId)
        .select('_id expertFeedback')
        .lean();
      if (!interaction) {
        skipped += 1;
        continue;
      }
      const result = await this.syncForInteraction(interaction);
      if (interaction.expertFeedback) updated += result.modifiedCount || 0;
      else {
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
