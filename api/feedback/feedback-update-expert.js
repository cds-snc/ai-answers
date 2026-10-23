import dbConnect from '../db/db-connect.js';
import { Interaction } from '../../models/interaction.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { requireObjectIdString } from '../util/db-query.js';
import { withProtection, authMiddleware, partnerOrAdminMiddleware } from '../../middleware/auth.js';
import EmbeddingMetadataService, { isAutoEvalFeedback } from '../../services/EmbeddingMetadataService.js';
import { VectorService } from '../../services/VectorServiceFactory.js';
import { canEditExpertFeedback } from '../util/expert-feedback-access.js';

// Only the rating fields the expert form edits. Never `type` (an edit must
// not be able to turn a human evaluation into 'ai' or back), `expertEmail`
// (the original author stays the author) or `neverStale` (own endpoint).
// TODO: totalScore is computed in the browser (ExpertFeedbackComponent.js)
// and stored as sent, and the scores are only checked to be numbers, not
// allowed values. That score decides which answers are reused for live
// answers. Recompute it here from the sentence/citation scores. Creating an
// evaluation (feedback-persist-expert.js) trusts it the same way.
const SCORE_FIELDS = ['sentence1Score', 'sentence2Score', 'sentence3Score', 'sentence4Score', 'citationScore', 'totalScore'];
const TEXT_FIELDS = [
  'sentence1Explanation', 'sentence2Explanation', 'sentence3Explanation', 'sentence4Explanation',
  'citationExplanation', 'expertCitationUrl', 'feedback',
];
const FLAG_FIELDS = [
  'sentence1Harmful', 'sentence2Harmful', 'sentence3Harmful', 'sentence4Harmful',
  'sentence1ContentIssue', 'sentence2ContentIssue', 'sentence3ContentIssue', 'sentence4ContentIssue',
];

function findInvalidField(expertFeedback) {
  const isScore = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));
  return SCORE_FIELDS.find((f) => !isScore(expertFeedback[f]))
    || TEXT_FIELDS.find((f) => typeof expertFeedback[f] !== 'string')
    || FLAG_FIELDS.find((f) => typeof expertFeedback[f] !== 'boolean')
    || null;
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
    if (!canEditExpertFeedback(req.user, ef)) {
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
    updates.lastEditedBy = req.user.email || '';
    updates.lastEditedAt = new Date();
    // null also matches evaluations saved before lastEditedAt existed.
    const saved = await ExpertFeedback.findOneAndUpdate(
      { _id: ef._id, lastEditedAt: expectedDate },
      { $set: updates },
      { new: true, lean: true }
    );
    if (!saved) {
      return conflict();
    }

    // The edit is saved at this point; a failure keeping the search data in
    // step is logged, not reported as a failed save.
    try {
      await EmbeddingMetadataService.syncForInteraction(interaction, saved);
      VectorService?.updateExpertFeedbackMetadata(interaction._id, saved);
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
