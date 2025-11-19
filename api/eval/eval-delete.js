import dbConnect from '../db/db-connect.js';
import { Interaction } from '../../models/interaction.js';
import { Eval } from '../../models/eval.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
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

    const interaction = await Interaction.findById(interactionId);
    if (!interaction) {
      return res.status(404).json({ message: 'Interaction not found' });
    }

    const evalId = interaction.autoEval;
    if (!evalId) {
      return res.status(200).json({ message: 'No evaluation to delete', deleted: 0, expertFeedbackDeleted: 0 });
    }

    const evalDoc = await Eval.findById(evalId).lean();
    // Unset reference on interaction
    interaction.autoEval = undefined;
    await interaction.save();

    // Delete eval
    const deletedEval = await Eval.deleteOne({ _id: evalId });
    let expertFeedbackDeleted = 0;
    if (evalDoc && evalDoc.expertFeedback) {
      const result = await ExpertFeedback.deleteOne({ _id: evalDoc.expertFeedback });
      expertFeedbackDeleted = result.deletedCount || 0;
    }

    return res.status(200).json({
      message: 'Evaluation deleted',
      deleted: deletedEval.deletedCount || 0,
      expertFeedbackDeleted
    });
  } catch (err) {
    console.error('Error in eval-delete:', err);
    return res.status(500).json({ message: 'Failed to delete evaluation', error: err.message });
  }
}

export default withProtection(withUser(handler), authMiddleware);
