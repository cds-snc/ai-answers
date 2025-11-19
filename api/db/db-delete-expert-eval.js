import dbConnect from './db-connect.js';
import EvaluationService from '../../services/EvaluationService.js';
import {
  authMiddleware,
  partnerOrAdminMiddleware,
  withProtection
} from '../../middleware/auth.js';

async function deleteExpertEvalHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  try {
    await dbConnect();
    const { chatId } = req.body;
    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }
    // Use EvaluationService to delete expert feedback for a chat
    const result = await EvaluationService.deleteExpertFeedbackForChat(chatId);
    if (result.error) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    return res.status(200).json({
      message: result.message,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete expert feedback', details: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(
    deleteExpertEvalHandler,
    authMiddleware,
    partnerOrAdminMiddleware
  )(req, res);
}
