import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { Interaction } from '../../models/interaction.js';
import { PublicFeedback } from '../../models/publicFeedback.js';
import { requireString } from '../util/db-query.js';
import { chatIdBelongsToSession } from '../../middleware/chat-session.js';

// The public form only collects these three. Building the document from
// them keeps a client-supplied id, timestamp, or extra key off the record.
function publicFeedbackFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const feedback = input.feedback;
  const publicFeedbackReason = input.publicFeedbackReason;
  const publicFeedbackScore = input.publicFeedbackScore;
  if (typeof feedback !== 'string' || feedback.trim() === '') return null;
  if (publicFeedbackReason != null && typeof publicFeedbackReason !== 'string') return null;
  if (publicFeedbackScore != null && (typeof publicFeedbackScore !== 'number' || !Number.isFinite(publicFeedbackScore))) return null;
  return {
    feedback,
    publicFeedbackReason: typeof publicFeedbackReason === 'string' ? publicFeedbackReason : '',
    publicFeedbackScore: publicFeedbackScore ?? null,
  };
}

async function feedbackPersistPublicHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    let { chatId, interactionId, publicFeedback } = req.body || {};
    if (!chatId || !interactionId || !publicFeedback) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // chat-graph-run stores the chatId on the session that opened it.
    // Knowing the ids (they show up in dashboards and exports) is not enough
    // to write feedback for that conversation.
    const sessionChatId = typeof chatId === 'string' ? chatId.trim() : '';
    if (!chatIdBelongsToSession(req, sessionChatId)) {
      return res.status(403).json({ error: 'invalid_chatId', message: 'ChatId does not belong to session' });
    }
    chatId = requireString(chatId, 'chatId');
    interactionId = requireString(interactionId, 'interactionId');
    const fields = publicFeedbackFields(publicFeedback);
    if (!fields) {
      return res.status(400).json({ message: 'Invalid public feedback' });
    }

    const chat = await Chat.findOne({ chatId }).populate({ path: 'interactions' });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    const existingInteraction = chat.interactions.find(interaction => interaction.interactionId === interactionId);
    if (!existingInteraction) {
      return res.status(404).json({ message: 'Interaction not found' });
    }
    // One public feedback record per interaction. Replacing the pointer
    // leaves the earlier document with nothing pointing at it, and the
    // metrics then show the replacement.
    if (existingInteraction.publicFeedback) {
      return res.status(409).json({ message: 'Public feedback already recorded' });
    }

    const publicFeedbackDoc = new PublicFeedback(fields);
    await publicFeedbackDoc.save();

    // Null in the filter is a check-and-set, same as question assignment:
    // two requests that both passed the read above cannot both attach.
    const claimed = await Interaction.findOneAndUpdate(
      { _id: existingInteraction._id, publicFeedback: null },
      { $set: { publicFeedback: publicFeedbackDoc._id } },
      { new: true }
    );
    if (!claimed) {
      await PublicFeedback.deleteOne({ _id: publicFeedbackDoc._id });
      const stillThere = await Interaction.findOne({ _id: existingInteraction._id }, { _id: 1 }).lean();
      if (!stillThere) {
        return res.status(404).json({ message: 'Interaction not found' });
      }
      return res.status(409).json({ message: 'Public feedback already recorded' });
    }

    res.status(200).json({ message: 'Public feedback logged successfully' });
  } catch (error) {
    console.error('Error saving public feedback:', error);
    res.status(500).json({ message: 'Failed to log public feedback', error: error.message });
  }
}

export default feedbackPersistPublicHandler;
