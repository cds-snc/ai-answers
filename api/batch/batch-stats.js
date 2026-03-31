import dbConnect from '../db/db-connect.js';
import mongoose from 'mongoose';
import { Batch } from '../../models/batch.js';
import { BatchItem } from '../../models/batchItem.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';

const COUNT_MAX_TIME_MS = 20000;

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

    // Query by both ObjectId and string batch IDs to stay compatible with any
    // legacy rows, but keep the predicate index-friendly.
    const batchIdString = String(batch._id);
    const batchFilter = { batch: { $in: [batch._id, batchIdString] } };
    const countOptions = { maxTimeMS: COUNT_MAX_TIME_MS };
    const collection = BatchItem.collection;

    const [total, processed, failed, skipped] = await Promise.all([
      collection.countDocuments(batchFilter, countOptions),
      collection.countDocuments({ ...batchFilter, chat: { $nin: [null, ''] } }, countOptions),
      collection.countDocuments({ ...batchFilter, error: { $nin: [null, ''] } }, countOptions),
      collection.countDocuments({ ...batchFilter, shortQuery: true }, countOptions),
    ]);

    const finished = Math.min(total, processed + failed);

    console.log(`[batch-stats] Counts: total=${total} processed=${processed} failed=${failed} skipped=${skipped} finished=${finished}`);

  return res.status(200).json({ batchId: String(batch._id), workflow: batch.workflow || 'Default', total, processed, failed, skipped, finished });
  } catch (err) {
    const isTimeout = err?.codeName === 'MaxTimeMSExpired' || err?.code === 50;
    if (isTimeout) {
      console.error(`[batch-stats] Query timed out for batchId=${batchId}`);
      return res.status(503).json({ message: 'Stats query timed out, please retry' });
    }
    console.error('Error computing batch stats:', err);
    return res.status(500).json({ message: 'Failed to compute stats', error: err.message });
  }
}

export default function handler(req, res) {
  return withProtection(batchStatsHandler, authMiddleware, partnerOrAdminMiddleware)(req, res);
}

