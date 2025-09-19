import dbConnect from '../db/db-connect.js';
import { Interaction } from '../../models/interaction.js';
import EvaluationService from '../../services/EvaluationService.js';
import { withUser, withProtection, authMiddleware } from '../../middleware/auth.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    await dbConnect();
    const { interactionId } = req.body || {};
    if (!interactionId) {
      return res.status(400).json({ message: 'Missing interactionId' });
    }

    const interaction = await Interaction.findById(interactionId).lean();
    if (!interaction) {
      return res.status(404).json({ message: 'Interaction not found' });
    }

    const evaluation = await EvaluationService.getEvaluationForInteraction(interactionId);
    if (!evaluation) {
      return res.status(200).json({ message: 'No evaluation found', evaluation: null });
    }
    // Ensure plain object for client consumption
    const evalObj = evaluation.toObject ? evaluation.toObject() : evaluation;
    return res.status(200).json({ message: 'OK', evaluation: evalObj });
  } catch (err) {
    console.error('Error in eval-get:', err);
    return res.status(500).json({ message: 'Failed to retrieve evaluation', error: err.message });
  }
}

export default withProtection(withUser(handler), authMiddleware);
