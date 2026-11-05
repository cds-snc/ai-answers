import dbConnect from '../db/db-connect.js';
import { Interaction } from '../../models/interaction.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { ExpertFeedbackRevision } from '../../models/expertFeedbackRevision.js';
import { requireObjectIdString } from '../util/db-query.js';
import { withProtection, authMiddleware, partnerOrAdminMiddleware } from '../../middleware/auth.js';
import { isAutoEvalFeedback } from '../../services/EmbeddingMetadataService.js';
import { canEditExpertFeedback } from '../util/expert-feedback-access.js';
import {
  SCORE_FIELDS, TEXT_FIELDS, FLAG_FIELDS, findInvalidScore, computeTotalScore, feedbackLabel, getAnswerSentenceCount,
} from '../util/expert-feedback-scoring.js';
import { syncCurrentExpertFeedback } from '../util/expert-feedback-sync.js';

// Only the rating fields the expert form edits. Never `type` (an edit must
// not be able to turn a human evaluation into 'ai' or back), `expertEmail`
// (the original author stays the author) or `neverStale` (own endpoint).
// `totalScore` and `feedback` are worked out below, not taken from the form.

function findInvalidField(expertFeedback) {
  return findInvalidScore(expertFeedback)
    || TEXT_FIELDS.find((f) => typeof expertFeedback[f] !== 'string')
    || FLAG_FIELDS.find((f) => typeof expertFeedback[f] !== 'boolean')
    || null;
}

// The old value of each field this edit changed. lastEditedBy/lastEditedAt are
// left out: every history entry already says who edited and when.
function changedOldValues(before, updates) {
  const previous = {};
  for (const field of Object.keys(updates)) {
    if (field === 'lastEditedBy' || field === 'lastEditedAt') continue;
    if ((before[field] ?? null) !== (updates[field] ?? null)) previous[field] = before[field] ?? null;
  }
  return previous;
}

async function feedbackUpdateExpertHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    let { interactionId, expertFeedbackId, expectedLastEditedAt = null, expertFeedback } = req.body || {};
    if (!interactionId || !expertFeedbackId || !expertFeedback || typeof expertFeedback !== 'object') {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    let expectedDate = null;
    if (expectedLastEditedAt != null) {
      expectedDate = new Date(expectedLastEditedAt);
      if (Number.isNaN(expectedDate.getTime())) {
        return res.status(400).json({ message: 'Missing or invalid field: expectedLastEditedAt' });
      }
    }
    // Every field is replaced, so every field must be sent - a missing one is
    // rejected rather than cleared.
    const invalidField = findInvalidField(expertFeedback);
    if (invalidField) {
      return res.status(400).json({ message: `Missing or invalid field: ${invalidField}` });
    }
    interactionId = requireObjectIdString(interactionId, 'interactionId');
    expertFeedbackId = requireObjectIdString(expertFeedbackId, 'expertFeedbackId');
    await dbConnect();

    const interaction = await Interaction.findById(interactionId);
    if (!interaction || !interaction.expertFeedback) {
      return res.status(404).json({ message: 'Expert feedback not found' });
    }
    const ef = await ExpertFeedback.findById(interaction.expertFeedback);
    if (!ef) {
      return res.status(404).json({ message: 'Expert feedback not found' });
    }
    if (isAutoEvalFeedback(ef)) {
      return res.status(400).json({ message: 'Automated evaluations cannot be edited' });
    }
    if (!await canEditExpertFeedback(req.user, ef)) {
      return res.status(403).json({ message: 'You can only edit your own expert evaluations' });
    }

    // Someone else saved an edit (or deleted and re-created the evaluation)
    // since this form loaded - refuse rather than overwrite their changes.
    // Keyed on lastEditedAt, not updatedAt: "never stale" also bumps
    // updatedAt but doesn't touch the fields this form saves. The match is
    // one atomic findOneAndUpdate, so two saves racing can't both pass.
    // Same approach as ScenarioOverrideService.upsertOverride.
    const conflict = () => res.status(409).json({
      message: 'Expert feedback was edited elsewhere',
      code: 'EXPERT_FEEDBACK_CONFLICT',
    });
    if (String(ef._id) !== expertFeedbackId) {
      return conflict();
    }
    const updates = {};
    for (const field of [...SCORE_FIELDS, ...TEXT_FIELDS, ...FLAG_FIELDS]) {
      updates[field] = expertFeedback[field];
    }
    updates.totalScore = computeTotalScore(updates, await getAnswerSentenceCount(interaction.answer));
    updates.feedback = feedbackLabel(updates.totalScore);
    updates.lastEditedBy = req.user.email || '';
    updates.lastEditedAt = new Date();
    // null also matches evaluations saved before lastEditedAt existed.
    // Returns the document as it was, so the history can't miss a change made
    // since `ef` was read.
    const before = await ExpertFeedback.findOneAndUpdate(
      { _id: ef._id, lastEditedAt: expectedDate },
      { $set: updates },
      { new: false, lean: true }
    );
    if (!before) {
      return conflict();
    }
    const saved = { ...before, ...updates, updatedAt: updates.lastEditedAt };

    // Also logged, not reported as a failed save: the edit itself went through.
    try {
      const previous = changedOldValues(before, updates);
      if (Object.keys(previous).length > 0) {
        await ExpertFeedbackRevision.create({
          interactionId: interaction._id,
          expertFeedbackId: ef._id,
          editedBy: updates.lastEditedBy,
          previous,
        });
      }
    } catch (historyError) {
      console.error('Expert feedback updated, but saving its history failed:', historyError);
    }

    // The edit is saved at this point; a failure keeping the search data in
    // step is logged, not reported as a failed save.
    try {
      await syncCurrentExpertFeedback(interaction._id);
    } catch (syncError) {
      console.error('Expert feedback updated, but syncing search metadata failed:', syncError);
    }

    return res.status(200).json({ message: 'Expert feedback updated', expertFeedback: saved });
  } catch (error) {
    console.error('Error updating expert feedback:', error);
    return res.status(500).json({ message: 'Failed to update expert feedback', error: error.message });
  }
}

export default withProtection(feedbackUpdateExpertHandler, authMiddleware, partnerOrAdminMiddleware);
