import dbConnect from '../db/db-connect.js';
import { Interaction } from '../../models/interaction.js';
import { Chat } from '../../models/chat.js';
import EvaluationService from '../../services/EvaluationService.js';
import { withUser, withProtection, authMiddleware } from '../../middleware/auth.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    await dbConnect();
    const { interactionId, forceFallbackEval = false, replaceExisting = true } = req.body || {};
    if (!interactionId) {
      return res.status(400).json({ message: 'Missing interactionId' });
    }

    const interaction = await Interaction.findById(interactionId);
    if (!interaction) {
      return res.status(404).json({ message: 'Interaction not found' });
    }

    // Resolve chatId and aiProvider
    const chat = await Chat.findOne({ interactions: interaction._id });
    const chatId = chat ? chat.chatId : null;
    const aiProvider = chat ? chat.aiProvider : null;

    if (!chatId) {
      return res.status(400).json({ message: 'Unable to resolve chatId for interaction' });
    }

    if (replaceExisting && interaction.autoEval) {
      // Leverage delete handler logic by unsetting and removing artifacts
      try {
        // Inline minimal delete: unset reference then delete eval and its EF
        const { Eval } = await import('../../models/eval.js');
        const { ExpertFeedback } = await import('../../models/expertFeedback.js');
        const evalDoc = await Eval.findById(interaction.autoEval).lean();
        interaction.autoEval = undefined;
        await interaction.save();
        if (evalDoc) {
          await Eval.deleteOne({ _id: evalDoc._id });
          if (evalDoc.expertFeedback) {
            await ExpertFeedback.deleteOne({ _id: evalDoc.expertFeedback });
          }
        }
      } catch (e) {
        // Continue even if delete fails
        console.warn('Failed to remove existing evaluation before rerun:', e?.message || e);
      }
    }

    const evaluation = await EvaluationService.evaluateInteraction(interaction, chatId, aiProvider, { forceFallbackEval });
    const evalObj = evaluation?.toObject ? evaluation.toObject() : evaluation;
    return res.status(200).json({ message: 'Re-evaluation completed', evaluation: evalObj });
  } catch (err) {
    console.error('Error in eval-run:', err);
    return res.status(500).json({ message: 'Failed to run evaluation', error: err.message });
  }
}

export default withProtection(withUser(handler), authMiddleware);
