import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { Interaction } from '../../models/interaction.js';
import { PublicFeedback } from '../../models/publicFeedback.js';
import { requireString } from '../util/db-query.js';
import { chatIdBelongsToSession } from '../../middleware/chat-session.js';
import { FEEDBACK_OPTIONS, SCORE_TO_KEY } from '../../src/constants/UserFeedbackOptions.js';

// Metrics count `$eq: 'yes'` / `'no'`. A padded "yes " would pass a non-empty
// check and then be counted as no, so the stored value is the trimmed one.
const PUBLIC_FEEDBACK_ANSWERS = new Set(['yes', 'no']);

// Reason charts group by score whenever the score is greater than null, and
// only fall back to the raw reason string when it is not. The score has to
// be one of the options for this answer: "yes" with a "no" score is counted
// as yes and labeled with the other answer's reason.
const SCORES_FOR_ANSWER = {
  yes: new Set(FEEDBACK_OPTIONS.YES.map((opt) => opt.score)),
  no: new Set(FEEDBACK_OPTIONS.NO.map((opt) => opt.score)),
};

// Translated option labels are short (the longest is well under 100
// characters). The cap rejects an essay in the request. The stored reason
// is the option id for the score, so that text never reaches the review
// panel or the log export. The body limit is much larger.
const PUBLIC_FEEDBACK_REASON_MAX_LENGTH = 300;

// The public form only collects these three. Building the document from
// them keeps a client-supplied id, timestamp, or extra key off the record.
// The reason field on the form is the translated label. The record stores
// the option id for the score, which is the key the review panel and the
// reason charts resolve.
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
  if (!Number.isInteger(publicFeedbackScore) || !SCORES_FOR_ANSWER[feedback].has(publicFeedbackScore)) {
    return null;
  }
  const reasonKey = SCORE_TO_KEY[publicFeedbackScore];
  if (!reasonKey) return null;

  return {
    feedback,
    publicFeedbackReason: reasonKey,
    publicFeedbackScore,
  };
}

// The chat page's message id is a counter, so the form posts a number.
// The interaction stores that same id as a string ("1"). A finite number
// is that id; anything else still has to be a plain string.
function interactionIdString(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return value;
}

async function feedbackPersistPublicHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    let { chatId, interactionId, publicFeedback } = req.body || {};
    // One trimmed chatId for the session check and the query. A missing or
    // whitespace value is a bad request, not an authorization failure.
    try {
      chatId = requireString(chatId, 'chatId');
      interactionId = requireString(interactionIdString(interactionId), 'interactionId');
    } catch {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    if (!publicFeedback) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // chat-graph-run stores the chatId on the session that opened it.
    // Knowing the ids (they show up in dashboards and exports) is not enough
    // to write feedback for that conversation. The session expires, and
    // signing in replaces it; the form treats this 403 as final.
    if (!chatIdBelongsToSession(req, chatId)) {
      return res.status(403).json({ error: 'invalid_chatId', message: 'ChatId does not belong to session' });
    }
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
    // metrics then show the replacement. Two requests can both read this
    // as empty; the update below is what keeps the second one out.
    if (existingInteraction.publicFeedback) {
      return res.status(409).json({ message: 'Public feedback already recorded' });
    }

    const publicFeedbackDoc = new PublicFeedback(fields);
    await publicFeedbackDoc.save();
    const linked = await Interaction.updateOne(
      { _id: existingInteraction._id, publicFeedback: null },
      { $set: { publicFeedback: publicFeedbackDoc._id } }
    );
    if (!linked.matchedCount) {
      // The other request linked its own document. This one is unreferenced.
      await PublicFeedback.deleteOne({ _id: publicFeedbackDoc._id });
      return res.status(409).json({ message: 'Public feedback already recorded' });
    }

    res.status(200).json({ message: 'Public feedback logged successfully' });
  } catch (error) {
    // Logged here. The response stays generic so a database error
    // does not reach the client. A stop after the insert and before the
    // link leaves that document unreferenced; the integrity check reports it,
    // and a retry can still link a new one because the pointer is empty.
    console.error('Error saving public feedback:', error);
    res.status(500).json({ message: 'Failed to log public feedback' });
  }
}

export default feedbackPersistPublicHandler;
