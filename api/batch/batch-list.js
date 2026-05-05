import dbConnect from '../db/db-connect.js';
import { Batch } from '../../models/batch.js';
import { BatchItem } from '../../models/batchItem.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';

async function batchListHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();

    // Only return batches created by the logged-in user.
    // Admins see all batches (including legacy ones without createdBy).
    const userId = req.user?.userId;
    const filter = req.user?.role === 'admin' ? {} : { createdBy: userId };
    let batches = await Batch.find(filter).sort({ createdAt: -1 }).lean();

    // Inline stats for every batch in a single aggregation so the frontend
    // doesn't need to fire N separate batch-stats requests.
    const batchIds = batches.map((b) => b._id);
    const batchIdStrings = batchIds.map(String);
    const allIds = [...batchIds, ...batchIdStrings];

    const statsAgg = batchIds.length
      ? await BatchItem.aggregate([
          { $match: { batch: { $in: allIds } } },
          {
            $group: {
              _id: { $toString: '$batch' },
              total: { $sum: 1 },
              processed: {
                $sum: {
                  $cond: [
                    { $and: [{ $ne: [{ $ifNull: ['$chat', null] }, null] }, { $ne: [{ $ifNull: ['$chat', ''] }, ''] }] },
                    1,
                    0,
                  ],
                },
              },
              failed: {
                $sum: {
                  $cond: [
                    { $and: [{ $ne: [{ $ifNull: ['$error', null] }, null] }, { $ne: [{ $ifNull: ['$error', ''] }, ''] }] },
                    1,
                    0,
                  ],
                },
              },
              skipped: { $sum: { $cond: [{ $eq: ['$shortQuery', true] }, 1, 0] } },
            },
          },
        ])
      : [];

    const statsMap = new Map(statsAgg.map((s) => [s._id, s]));

    const result = batches.map((b) => {
      const idStr = String(b._id);
      const s = statsMap.get(idStr) || { total: 0, processed: 0, failed: 0, skipped: 0 };
      const finished = Math.min(s.total, s.processed + s.failed);
      return { ...b, stats: { total: s.total, processed: s.processed, failed: s.failed, skipped: s.skipped, finished } };
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error retrieving batches:', error);
    res.status(500).json({ message: 'Failed to retrieve batches', error: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(batchListHandler, authMiddleware, partnerOrAdminMiddleware)(req, res);
}