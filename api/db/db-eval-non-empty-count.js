// api/db/db-eval-non-empty-count.js
import dbConnect from './db-connect.js';
import { Eval } from '../../models/eval.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function evalNonEmptyCountHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  await dbConnect();
  try {
    // Count Evals that have a full evaluation (hasMatches: true and expertFeedback is not null)
    const count = await Eval.countDocuments({
      hasMatches: true,
      expertFeedback: { $exists: true, $ne: null }
    });
    res.status(200).json({ count });
  } catch (error) {
    console.error('Error getting non-empty eval count:', error);
    res.status(500).json({ error: 'Failed to get non-empty eval count' });
  }
}

export default function handler(req, res) {
  return withProtection(evalNonEmptyCountHandler, authMiddleware, adminMiddleware)(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
