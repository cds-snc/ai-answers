// filepath: api/db/db-expert-feedback-count.js
import dbConnect from './db-connect.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function expertFeedbackCountHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  await dbConnect();
  try {
    const count = await ExpertFeedback.countDocuments({ type: 'expert' });
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch expert feedback count' });
  }
}

export default function handler(req, res) {
  return withProtection(expertFeedbackCountHandler, authMiddleware, adminMiddleware)(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
