// api/db/db-eval-metrics.js
import dbConnect from './db-connect.js';
import { Eval } from '../../models/eval.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function evalMetricsHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  await dbConnect();
  try {
    const total = await Eval.countDocuments({});
    const processed = await Eval.countDocuments({ processed: true });
    const hasMatches = await Eval.countDocuments({ hasMatches: true });
    // Counts of no-match reasons
    const noMatchAgg = await Eval.aggregate([
      { $match: { hasMatches: false } },
      { $group: { _id: '$noMatchReasonType', count: { $sum: 1 } } }
    ]);
    const fallbackAgg = await Eval.aggregate([
      { $match: { fallbackType: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$fallbackType', count: { $sum: 1 } } }
    ]);

    const noMatchByReason = {};
    noMatchAgg.forEach((r) => { noMatchByReason[r._id || 'unknown'] = r.count; });
  const fallbackByType = {};
  fallbackAgg.forEach((r) => { fallbackByType[r._id || 'unknown'] = r.count; });

    res.status(200).json({
      total,
      processed,
      hasMatches,
      noMatchByReason,
      fallbackByType
    });
  } catch (error) {
    console.error('Error getting eval metrics:', error);
    res.status(500).json({ error: 'Failed to get eval metrics' });
  }
}

export default function handler(req, res) {
  return withProtection(evalMetricsHandler, authMiddleware, adminMiddleware)(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
