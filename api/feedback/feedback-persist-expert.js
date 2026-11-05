
import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { Interaction } from '../../models/interaction.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { VectorService } from '../../services/VectorServiceFactory.js';
import { Embedding } from '../../models/embedding.js';
import { SentenceEmbedding } from '../../models/sentenceEmbedding.js';
import { requireString } from '../util/db-query.js';
import { withProtection, authMiddleware, partnerOrAdminMiddleware } from '../../middleware/auth.js';
import EmbeddingMetadataService from '../../services/EmbeddingMetadataService.js';
import {
  SCORE_FIELDS, TEXT_FIELDS, FLAG_FIELDS, findInvalidScore, computeTotalScore, feedbackLabel, getAnswerSentenceCount,
} from '../util/expert-feedback-scoring.js';

async function feedbackPersistExpertHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    let { chatId, interactionId, expertFeedback } = req.body;
    if (!chatId || !interactionId || !expertFeedback || typeof expertFeedback !== 'object') {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const invalidScore = findInvalidScore(expertFeedback, { allowMissing: true });
    if (invalidScore) {
      return res.status(400).json({ message: `Invalid field: ${invalidScore}` });
    }
    chatId = requireString(chatId, 'chatId');
    let chat = await Chat.findOne({ chatId }).populate({ path: 'interactions' });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    let existingInteraction = chat.interactions.find(interaction => interaction.interactionId == interactionId);
    if (!existingInteraction) {
      return res.status(404).json({ message: 'Interaction not found' });
    }
    // Never replace a review: an answer gets one, changed only through
    // feedback-update-expert. Another expert may have saved since this form opened.
    const alreadyReviewed = () => res.status(409).json({
      message: 'This answer already has an expert evaluation',
      code: 'EXPERT_FEEDBACK_ALREADY_EXISTS',
    });
    if (existingInteraction.expertFeedback) {
      return alreadyReviewed();
    }
    let expertFeedbackDoc = new ExpertFeedback();
    // Only what the expert form rates. Everything else is set by the server, so
    // a request can't set type, edit history, neverStale or answerImprovement.
    for (const field of [...SCORE_FIELDS, ...TEXT_FIELDS, ...FLAG_FIELDS]) {
      if (expertFeedback[field] !== undefined) expertFeedbackDoc[field] = expertFeedback[field];
    }
    expertFeedbackDoc.type = 'expert';
    expertFeedbackDoc.totalScore = computeTotalScore(expertFeedback, await getAnswerSentenceCount(existingInteraction.answer));
    expertFeedbackDoc.feedback = feedbackLabel(expertFeedbackDoc.totalScore);
    // Attach expertEmail if available (req.user set by authMiddleware)
    if (req.user && req.user.email) {
      expertFeedbackDoc.expertEmail = req.user.email;
    }
    await expertFeedbackDoc.save();
    // Linked in one atomic step, so of two saves at the same moment only one
    // wins. Both forms are spelled out rather than relying on null matching a
    // missing field, which DocumentDB may not treat the same as MongoDB.
    const linked = await Interaction.findOneAndUpdate(
      { _id: existingInteraction._id, $or: [{ expertFeedback: null }, { expertFeedback: { $exists: false } }] },
      { $set: { expertFeedback: expertFeedbackDoc._id } }
    );
    if (!linked) {
      await ExpertFeedback.deleteOne({ _id: expertFeedbackDoc._id });
      return alreadyReviewed();
    }
    await EmbeddingMetadataService.syncForInteraction(existingInteraction, expertFeedbackDoc.toObject());
    // Add embedding to VectorService
    const embedding = await Embedding.findOne({ interactionId: existingInteraction._id });
    if (embedding && embedding.questionsAnswerEmbedding && embedding.answerEmbedding) {
      const sentenceDocs = await SentenceEmbedding.find({ parentEmbeddingId: embedding._id }).select('embedding').lean();
      VectorService.addExpertFeedbackEmbedding({
        interactionId: existingInteraction._id,
        expertFeedbackId: expertFeedbackDoc._id,
        expertFeedbackTotalScore: expertFeedbackDoc.totalScore,
        expertFeedbackCreatedAt: expertFeedbackDoc.createdAt,
        expertFeedbackNeverStale: expertFeedbackDoc.neverStale,
        questionsAnswerEmbedding: embedding.questionsAnswerEmbedding,
        questionsEmbedding: embedding.questionsEmbedding,
        sentenceEmbeddings: Array.isArray(sentenceDocs) ? sentenceDocs.map(d => d.embedding) : []
      });
    }
    res.status(200).json({ message: 'Expert feedback logged successfully' });
  } catch (error) {
    console.error('Error saving expert feedback:', error);
    res.status(500).json({ message: 'Failed to log expert feedback', error: error.message });
  }
}

export default withProtection(feedbackPersistExpertHandler, authMiddleware, partnerOrAdminMiddleware);
