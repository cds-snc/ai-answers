import dbConnect from '../db/db-connect.js';
import { Interaction } from '../../models/interaction.js';
import { PublicFeedback } from '../../models/publicFeedback.js';
import { withUser, withProtection } from '../../middleware/auth.js';

async function feedbackGetPublicHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    await dbConnect();
    const { interactionId } = req.body;
    if (!interactionId) return res.status(400).json({ message: 'Missing required fields' });
    const interaction = await Interaction.findById(interactionId).lean();
    if (!interaction) return res.status(404).json({ message: 'Interaction not found' });
    if (!interaction.publicFeedback) return res.status(200).json({ message: 'No public feedback', sentences: [] });
    const pf = await PublicFeedback.findById(interaction.publicFeedback).lean();
    if (!pf) return res.status(200).json({ message: 'No public feedback', sentences: [] });
    // If public feedback contained sentence-level comments store them under sentences array, else return feedback as single item
    const sentences = pf.sentences || [];
    return res.status(200).json({ publicFeedback: pf, sentences, message: 'OK' });
  } catch (err) {
    console.error('Error fetching public feedback:', err);
    return res.status(500).json({ message: 'Failed to retrieve public feedback', error: err.message });
  }
}

export default withProtection(withUser(feedbackGetPublicHandler));
