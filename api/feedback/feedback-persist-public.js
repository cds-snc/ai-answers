import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { Interaction } from '../../models/interaction.js';
import { PublicFeedback } from '../../models/publicFeedback.js';
import { requireString } from '../util/db-query.js';
import { chatIdBelongsToSession } from '../../middleware/chat-session.js';
import { FEEDBACK_OPTIONS } from '../../src/constants/UserFeedbackOptions.js';

// Metrics count `$eq: 'yes'` / `'no'`. A padded "yes " would pass a non-empty
// check and then be counted as no, so the stored value is the trimmed one.
const PUBLIC_FEEDBACK_ANSWERS = new Set(['yes', 'no']);

// The public form's scores. A session holder can submit one record per
// interaction; a score outside this set would still be grouped into the
// reason charts whenever it is greater than null.
const PUBLIC_FEEDBACK_SCORES = new Set(
  [...FEEDBACK_OPTIONS.YES, ...FEEDBACK_OPTIONS.NO].map((opt) => opt.score)
);

// Translated option labels are short (the longest is well under 100
// characters). The cap is what stops an arbitrary essay from landing on
// the review panel and in the log export. The body limit is much larger.
const PUBLIC_FEEDBACK_REASON_MAX_LENGTH = 300;

// The public form only collects these three. Building the document from
// them keeps a client-supplied id, timestamp, or extra key off the record.
function publicFeedbackFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const feedback = typeof input.feedback === 'string' ? input.feedback.trim() : '';
  if (!PUBLIC_FEEDBACK_ANSWERS.has(feedback)) return null;

  const publicFeedbackReason = input.publicFeedbackReason;
  if (publicFeedbackReason != null && typeof publicFeedbackReason !== 'string') return null;
  if (typeof publicFeedbackReason === 'string' && publicFeedbackReason.length > PUBLIC_FEEDBACK_REASON_MAX_LENGTH) {
    return null;
  }

  const publicFeedbackScore = input.publicFeedbackScore;
  if (
    publicFeedbackScore != null &&
    (!Number.isInteger(publicFeedbackScore) || !PUBLIC_FEEDBACK_SCORES.has(publicFeedbackScore))
  ) {
    return null;
  }

  return {
    feedback,
    publicFeedbackReason: typeof publicFeedbackReason === 'string' ? publicFeedbackReason.trim() : '',
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
    // A whitespace-only chatId is missing, not an authorization failure.
    // Trimming first keeps it from falling through to the session check.
    const sessionChatId = typeof chatId === 'string' ? chatId.trim() : '';
    if (!sessionChatId || !interactionId || !publicFeedback) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // chat-graph-run stores the chatId on the session that opened it.
    // Knowing the ids (they show up in dashboards and exports) is not enough
    // to write feedback for that conversation.
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
    // Logged here. The response stays generic so a database error
    // does not reach the client.
    console.error('Error saving public feedback:', error);
    res.status(500).json({ message: 'Failed to log public feedback' });
  }
}

export default feedbackPersistPublicHandler;
