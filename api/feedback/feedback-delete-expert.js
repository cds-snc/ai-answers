import dbConnect from '../db/db-connect.js';
import { Interaction } from '../../models/interaction.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { requireObjectIdString } from '../util/db-query.js';
import { withProtection, authMiddleware, partnerOrAdminMiddleware } from '../../middleware/auth.js';
import EmbeddingMetadataService from '../../services/EmbeddingMetadataService.js';
import { VectorService } from '../../services/VectorServiceFactory.js';
import { canDeleteExpertFeedback } from '../util/expert-feedback-access.js';

async function feedbackDeleteExpertHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    let { interactionId } = req.body || {};
    if (!interactionId) {
      return res.status(400).json({ error: 'interactionId is required' });
    }
    interactionId = requireObjectIdString(interactionId, 'interactionId');
    await dbConnect();

    // Try to find by _id first, then by interactionId field
    let interaction = null;
    try {
      interaction = await Interaction.findById(interactionId);
    } catch (e) {
      // ignore cast errors and try by field
    }
    if (!interaction) {
      interaction = await Interaction.findOne({ interactionId: interactionId });
    }

    if (!interaction) {
      return res.status(404).json({ error: 'Interaction not found' });
    }

    const efId = interaction.expertFeedback;
    if (!efId) {
      return res.status(200).json({ message: 'No expert feedback attached to this interaction', deletedCount: 0 });
    }

    // The author, or any admin (canDeleteExpertFeedback).
    // A link to an evaluation that no longer exists is left from an earlier
    // delete that failed halfway; anyone may clear it.
    const ef = await ExpertFeedback.findById(efId).lean();
    if (ef && !await canDeleteExpertFeedback(req.user, ef)) {
      return res.status(403).json({ error: 'You can only delete your own expert evaluations' });
    }

    // TODO: review how deleted and edited evaluations are backed up for
    // recovery. The app keeps no copy of a deleted evaluation, and
    // ExpertFeedbackRevision only holds older values from edits, so recovery
    // relies on production database backups.

    // Delete first, then unlink. If the delete fails, everything stays linked
    // and a retry starts over; if the unlink fails, a retry finds the link,
    // deletes nothing and clears it.
    const result = await ExpertFeedback.deleteOne({ _id: efId });
    const deletedCount = result.deletedCount || 0;
    // Only this evaluation's link, in case a new one was saved meanwhile.
    await Interaction.updateOne({ _id: interaction._id, expertFeedback: efId }, { $unset: { expertFeedback: 1 } });

    // The evaluation is gone at this point; a failure keeping the search data
    // in step is logged, not reported as a failed delete.
    try {
      await EmbeddingMetadataService.clearForInteraction(interaction._id);
      VectorService?.updateExpertFeedbackMetadata(interaction._id, null);
    } catch (syncError) {
      console.error('Expert feedback deleted, but clearing search metadata failed:', syncError);
    }

    return res.status(200).json({ message: `Deleted ${deletedCount} expert feedback(s) for interaction ${interaction._id}`, deletedCount });
  } catch (error) {
    console.error('Error deleting expert feedback for interaction:', error);
    return res.status(500).json({ error: 'Failed to delete expert feedback', details: error.message });
  }
}

export default withProtection(feedbackDeleteExpertHandler, authMiddleware, partnerOrAdminMiddleware);
