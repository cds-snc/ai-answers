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

// 409 only when the pointer names a stored document. The other save can
// still fail. A 409 would close the form, and the retry that drops a
// dangling pointer would never run. This read does not change the pointer.
async function respondFromPointer(res, interactionObjectId) {
  const current = await Interaction.findOne(
    { _id: interactionObjectId },
    { publicFeedback: 1 }
  ).lean();
  if (!current) {
    return res.status(404).json({ message: 'Interaction not found' });
  }
  if (current.publicFeedback && await PublicFeedback.exists({ _id: current.publicFeedback })) {
    return res.status(409).json({ message: 'Public feedback already recorded' });
  }
  return res.status(500).json({ message: 'Failed to log public feedback' });
}

// 409 only when this update linked the stored document. The filter is
// publicFeedback: null, so another request can claim that slot between
// the exists() check and this write. A miss is re-read: 409 only when
// the pointer that remains names a stored document, otherwise 500 so
// the form stays open. The claimer's save can still throw.
async function linkStoredFeedback(res, interactionObjectId, pointerId) {
  const restored = await Interaction.updateOne(
    { _id: interactionObjectId, publicFeedback: null },
    { $set: { publicFeedback: pointerId, publicFeedbackRecover: null } }
  );
  if (restored.matchedCount > 0) {
    return res.status(409).json({ message: 'Public feedback already recorded' });
  }
  return respondFromPointer(res, interactionObjectId);
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
    // metrics then show the replacement.
    // A claim can outlive the save: the save failed and clearing the
    // pointer failed too, or the process stopped between the two writes.
    // The pointer then names a document that was never stored. Drop it
    // and save this request, so a retry does not report the feedback as
    // already recorded. The other request's insert can commit after the
    // check and before the clear. Put the same id back when the document
    // is there, and do not insert another one. The clear keeps that id
    // across the second read: a stop before the put-back still has it.
    // Once that read shows no document, the id is dropped. A recovery
    // pointer names a stored document, or it is empty.
    if (!existingInteraction.publicFeedback && existingInteraction.publicFeedbackRecover) {
      const recoverId = existingInteraction.publicFeedbackRecover;
      if (await PublicFeedback.exists({ _id: recoverId })) {
        return linkStoredFeedback(res, existingInteraction._id, recoverId);
      }
      await Interaction.updateOne(
        { _id: existingInteraction._id, publicFeedback: null, publicFeedbackRecover: recoverId },
        { $set: { publicFeedbackRecover: null } }
      );
    }
    if (existingInteraction.publicFeedback) {
      const pointerId = existingInteraction.publicFeedback;
      const saved = await PublicFeedback.exists({ _id: pointerId });
      if (saved) {
        return res.status(409).json({ message: 'Public feedback already recorded' });
      }
      await Interaction.updateOne(
        { _id: existingInteraction._id, publicFeedback: pointerId },
        { $set: { publicFeedback: null, publicFeedbackRecover: pointerId } }
      );
      if (await PublicFeedback.exists({ _id: pointerId })) {
        return linkStoredFeedback(res, existingInteraction._id, pointerId);
      }
      await Interaction.updateOne(
        { _id: existingInteraction._id, publicFeedback: null, publicFeedbackRecover: pointerId },
        { $set: { publicFeedbackRecover: null } }
      );
    }

    // The id exists as soon as the document is constructed, so the interaction
    // can point at it before the insert. Claiming first means a failed insert
    // can drop the pointer and a retry stores one record. Inserting first
    // leaves an orphan when the claim throws, and the retry attaches a second
    // document. Null in the filter is a check-and-set, same as question
    // assignment: two requests that both passed the read above cannot both claim.
    const publicFeedbackDoc = new PublicFeedback(fields);
    const claimed = await Interaction.findOneAndUpdate(
      { _id: existingInteraction._id, publicFeedback: null },
      { $set: { publicFeedback: publicFeedbackDoc._id, publicFeedbackRecover: null } },
      { new: true }
    );
    if (!claimed) {
      // This request did not claim the id. The other request clears the
      // pointer when its own save throws.
      return respondFromPointer(res, existingInteraction._id);
    }
    try {
      await publicFeedbackDoc.save();
    } catch (saveError) {
      try {
        // save() can throw after the insert is acknowledged (duplicate key,
        // connection drop). Keep the id only when that document is stored.
        // A throw before the insert clears both pointers, so the recovery
        // field does not name an id that was never written.
        const stored = await PublicFeedback.exists({ _id: publicFeedbackDoc._id });
        await Interaction.updateOne(
          { _id: existingInteraction._id, publicFeedback: publicFeedbackDoc._id },
          { $set: { publicFeedback: null, publicFeedbackRecover: stored ? publicFeedbackDoc._id : null } }
        );
      } catch (clearError) {
        console.error('Error clearing public feedback after a failed save:', clearError);
      }
      throw saveError;
    }
    // The cleanup above can clear this claim while the insert is in
    // flight: it saw no document yet, dropped the pointer, and claimed
    // its own id. Keep this document only when the interaction names it.
    // An empty pointer is that clear landing before the other claim, so
    // attach this document there. A different id stays as it is; this
    // document is removed and the answer follows the pointer that remains.
    // Linking clears the recovery id the clear wrote, so the next request
    // does not treat this document as still unlinked.
    const linked = await Interaction.findOneAndUpdate(
      {
        _id: existingInteraction._id,
        $or: [
          { publicFeedback: publicFeedbackDoc._id },
          { publicFeedback: null },
        ],
      },
      { $set: { publicFeedback: publicFeedbackDoc._id, publicFeedbackRecover: null } },
      { new: true }
    );
    if (!linked) {
      await PublicFeedback.deleteOne({ _id: publicFeedbackDoc._id });
      return respondFromPointer(res, existingInteraction._id);
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
