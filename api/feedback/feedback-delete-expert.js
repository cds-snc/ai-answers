import dbConnect from '../db/db-connect.js';
import { Interaction } from '../../models/interaction.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { withUser, withProtection } from '../../middleware/auth.js';

async function feedbackDeleteExpertHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    await dbConnect();
    const { interactionId } = req.body;
    if (!interactionId) {
      return res.status(400).json({ error: 'interactionId is required' });
    }

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

    // Unset the expertFeedback reference on the interaction
    interaction.expertFeedback = undefined;
    await interaction.save();

    // Delete the expert feedback document
    const result = await ExpertFeedback.deleteOne({ _id: efId });
    const deletedCount = result.deletedCount || 0;

    return res.status(200).json({ message: `Deleted ${deletedCount} expert feedback(s) for interaction ${interaction._id}`, deletedCount });
  } catch (error) {
    console.error('Error deleting expert feedback for interaction:', error);
    return res.status(500).json({ error: 'Failed to delete expert feedback', details: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(withUser(feedbackDeleteExpertHandler))(req, res);
}
