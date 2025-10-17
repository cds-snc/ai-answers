import dbConnect from '../db/db-connect.js';
import { Interaction } from '../../models/interaction.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { withUser, withProtection } from '../../middleware/auth.js';

async function feedbackExpertNeverStaleHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    const { interactionId, neverStale } = req.body;
    if (!interactionId || typeof neverStale === 'undefined') {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Find interaction by ObjectId or by interactionId field
    let interaction = null;
    try {
      interaction = await Interaction.findById(interactionId);
    } catch (e) {
      // ignore cast errors
    }
    if (!interaction) {
      interaction = await Interaction.findOne({ interactionId: interactionId });
    }

    if (!interaction) {
      return res.status(404).json({ message: 'Interaction not found' });
    }

    // If interaction has expertFeedback, update it; otherwise create one and attach
    let ef = null;
    if (interaction.expertFeedback) {
      ef = await ExpertFeedback.findById(interaction.expertFeedback);
      if (!ef) {
        // create a new one if the referenced document is missing
        ef = new ExpertFeedback();
      }
    } else {
      ef = new ExpertFeedback();
    }

    ef.neverStale = !!neverStale;
    await ef.save();

    // If not already attached, attach and save
    if (!interaction.expertFeedback || String(interaction.expertFeedback) !== String(ef._id)) {
      interaction.expertFeedback = ef._id;
      await interaction.save();
    }

    return res.status(200).json({ message: 'Expert feedback updated', expertFeedback: ef });
  } catch (err) {
    console.error('Error updating expertFeedback.neverStale:', err);
    return res.status(500).json({ message: 'Failed to update expert feedback neverStale', error: err.message });
  }
}

export default function handler(req, res) {
  return withProtection(withUser(feedbackExpertNeverStaleHandler))(req, res);
}
