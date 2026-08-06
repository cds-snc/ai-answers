import dbConnect from '../db/db-connect.js';
import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function deleteAllExperimentalBatchesHandler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ message: 'Method not allowed' });

  try {
    await dbConnect();
    const itemsResult = await ExperimentalBatchItem.deleteMany({});
    const batchesResult = await ExperimentalBatch.deleteMany({});
    return res.status(200).json({
      success: true,
      deletedBatches: batchesResult.deletedCount || 0,
      deletedBatchItems: itemsResult.deletedCount || 0
    });
  } catch (error) {
    console.error('Error deleting all experimental batches:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete all experimental batches', error: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(deleteAllExperimentalBatchesHandler, authMiddleware, adminMiddleware)(req, res);
}
