import dbConnect from '../db/db-connect.js';
import { Batch } from '../../models/batch.js';
import { BatchItem } from '../../models/batchItem.js';
import { Chat } from '../../models/chat.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function deleteAllBatchesHandler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await dbConnect();

    const batches = await Batch.find({}).select('_id').lean();
    const batchIds = batches.map(b => b._id);

    let deletedBatches = 0;
    let deletedBatchItems = 0;

    if (batchIds.length > 0) {
      // For safety, iterate batch items and remove referenced chats using document delete
      const items = await BatchItem.find({ batch: { $in: batchIds } }).select('chat _id').lean();
      for (const item of items) {
        if (item.chat) {
          try {
            const chat = await Chat.findById(item.chat);
            if (chat) await chat.deleteOne();
          } catch (e) {
            console.warn('Failed to delete chat for batch item', item._id, e);
          }
        }
      }

      const itemsRes = await BatchItem.deleteMany({ batch: { $in: batchIds } });
      deletedBatchItems = itemsRes.deletedCount || 0;

      const batchesRes = await Batch.deleteMany({ _id: { $in: batchIds } });
      deletedBatches = batchesRes.deletedCount || 0;
    }

    return res.status(200).json({ success: true, deletedBatches, deletedBatchItems });
  } catch (error) {
    console.error('Error deleting all batches:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete all batches', error: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(deleteAllBatchesHandler, authMiddleware, adminMiddleware)(req, res);
}
