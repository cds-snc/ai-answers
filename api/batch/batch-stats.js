import dbConnect from '../db/db-connect.js';
import mongoose from 'mongoose';
import { Batch } from '../../models/batch.js';
import { BatchItem } from '../../models/batchItem.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function batchStatsHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method Not Allowed' });

  const { batchId } = req.query || {};
  if (!batchId) return res.status(400).json({ message: 'batchId is required' });

  try {
    await dbConnect();

    
    let batch = null;
    if (mongoose.Types.ObjectId.isValid(batchId)) {
      batch = await Batch.findById(batchId);
      if (batch) console.log(`[batch-stats] Found batch by _id: _id=${batch._id}`);
    }
    
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    // Coerce batch._id to ObjectId when possible to avoid type mismatches
    let batchObjectId = batch._id;
    try {
      if (!mongoose.Types.ObjectId.isValid(batchObjectId)) {
        batchObjectId = mongoose.Types.ObjectId(String(batchObjectId));
      }
    } catch (e) {
      // leave as-is if coercion fails
    }

    // Use aggregation to compute totals in a single DB roundtrip.
    // Match using stringified comparison so the pipeline is robust to ObjectId vs string storage.
    const batchIdString = String(batch._id);
    const agg = await BatchItem.aggregate([
      { $match: { $expr: { $eq: [ { $toString: '$batch' }, batchIdString ] } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          processed: {
            $sum: {
              $cond: [
                { $and: [ { $ne: [ { $ifNull: ['$chat', null] }, null ] }, { $ne: [ { $ifNull: ['$chat', ''] }, '' ] } ] },
                1,
                0,
              ],
            },
          },
          failed: {
            $sum: {
              $cond: [
                { $and: [ { $ne: [ { $ifNull: ['$error', null] }, null ] }, { $ne: [ { $ifNull: ['$error', ''] }, '' ] } ] },
                1,
                0,
              ],
            },
          },
          skipped: { $sum: { $cond: [ { $eq: ['$shortQuery', true] }, 1, 0 ] } },
        },
      },
    ]);

    const counts = (agg && agg[0]) ? agg[0] : { total: 0, processed: 0, failed: 0, skipped: 0 };
    const total = counts.total || 0;
    const processed = counts.processed || 0;
    const failed = counts.failed || 0;
    const skipped = counts.skipped || 0;
    const finished = Math.min(total, processed + failed);

    console.log(`[batch-stats] Counts(agg): total=${total} processed=${processed} failed=${failed} skipped=${skipped} finished=${finished}`);

  return res.status(200).json({ batchId: String(batch._id), workflow: batch.workflow || 'Default', total, processed, failed, skipped, finished });
  } catch (err) {
    console.error('Error computing batch stats:', err);
    return res.status(500).json({ message: 'Failed to compute stats', error: err.message });
  }
}

export default function handler(req, res) {
  return withProtection(batchStatsHandler, authMiddleware, adminMiddleware)(req, res);
}

