import { Interaction } from '../../models/interaction.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import EmbeddingMetadataService from '../../services/EmbeddingMetadataService.js';
import { VectorService } from '../../services/VectorServiceFactory.js';

// Copies an interaction's evaluation onto the search data, re-read from the
// database. Callers must not pass a copy they loaded earlier: an edit or delete
// that landed since would be overwritten, which can restore an old score or a
// deleted evaluation's ID. This narrows that window but can't close it.
export async function syncCurrentExpertFeedback(interactionId) {
  const interaction = await Interaction.findById(interactionId).select('_id expertFeedback').lean();
  if (!interaction) return;
  const feedback = interaction.expertFeedback
    ? await ExpertFeedback.findById(interaction.expertFeedback).lean()
    : null;
  await EmbeddingMetadataService.syncForInteraction(interaction, feedback);
  VectorService?.updateExpertFeedbackMetadata(interaction._id, feedback);
}
