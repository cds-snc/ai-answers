import dbConnect from '../db/db-connect.js';
import { Interaction } from '../../models/interaction.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { withUser, withProtection } from '../../middleware/auth.js';

async function feedbackGetExpertHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
  await dbConnect();
  const { interactionId } = req.body;
  if (!interactionId) return res.status(400).json({ message: 'Missing required fields' });
  const interaction = await Interaction.findById(interactionId).lean();
  if (!interaction) return res.status(404).json({ message: 'Interaction not found' });
  if (!interaction.expertFeedback) return res.status(200).json({ message: 'No expert feedback', sentences: [] });
  const ef = await ExpertFeedback.findById(interaction.expertFeedback).lean();
    if (!ef) return res.status(200).json({ message: 'No expert feedback', sentences: [] });
    // Convert expert feedback to a sentences array for client
    const sentences = [];
    for (let i = 1; i <= 4; i++) {
      const scoreKey = `sentence${i}Score`;
      const explanationKey = `sentence${i}Explanation`;
      if (typeof ef[scoreKey] !== 'undefined' || ef[explanationKey]) {
        sentences.push({ score: ef[scoreKey], explanation: ef[explanationKey] || '' });
      }
    }
    return res.status(200).json({ expertFeedback: ef, sentences, message: 'OK' });
  } catch (err) {
    console.error('Error fetching expert feedback:', err);
    return res.status(500).json({ message: 'Failed to retrieve expert feedback', error: err.message });
  }
}

export default withProtection(withUser(feedbackGetExpertHandler));
