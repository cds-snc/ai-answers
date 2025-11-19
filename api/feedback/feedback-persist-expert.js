
import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { VectorService } from '../../services/VectorServiceFactory.js';
import { Embedding } from '../../models/embedding.js';
import { SentenceEmbedding } from '../../models/sentenceEmbedding.js';
import { withUser, withProtection } from '../../middleware/auth.js';

async function feedbackPersistExpertHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    const { chatId, interactionId, expertFeedback } = req.body;
    if (!chatId || !interactionId || !expertFeedback) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    let chat = await Chat.findOne({ chatId }).populate({ path: 'interactions' });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    let existingInteraction = chat.interactions.find(interaction => interaction.interactionId == interactionId);
    if (!existingInteraction) {
      return res.status(404).json({ message: 'Interaction not found' });
    }
    let expertFeedbackDoc = new ExpertFeedback();
    Object.assign(expertFeedbackDoc, expertFeedback);
    // Attach expertEmail if available
    if (req.user && req.user.email) {
      expertFeedbackDoc.expertEmail = req.user.email;
    }
    existingInteraction.expertFeedback = expertFeedbackDoc._id;
    await expertFeedbackDoc.save();
    // Add embedding to VectorService
    const embedding = await Embedding.findOne({ interactionId: existingInteraction._id });
    if (embedding && embedding.questionsAnswerEmbedding && embedding.answerEmbedding) {
      const sentenceDocs = await SentenceEmbedding.find({ parentEmbeddingId: embedding._id }).select('embedding').lean();
      VectorService.addExpertFeedbackEmbedding({
        interactionId: existingInteraction._id,
        expertFeedbackId: expertFeedbackDoc._id,
        questionsAnswerEmbedding: embedding.questionsAnswerEmbedding,
        questionsEmbedding: embedding.questionsEmbedding,
        sentenceEmbeddings: Array.isArray(sentenceDocs) ? sentenceDocs.map(d => d.embedding) : []
      });
    }
    await existingInteraction.save();
    res.status(200).json({ message: 'Expert feedback logged successfully' });
  } catch (error) {
    console.error('Error saving expert feedback:', error);
    res.status(500).json({ message: 'Failed to log expert feedback', error: error.message });
  }
}

export default withProtection(withUser(feedbackPersistExpertHandler));
