import dbConnect from '../db/db-connect.js';
import { Batch } from '../../models/batch.js';
import { BatchItem } from '../../models/batchItem.js';
import { Chat } from '../../models/chat.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function batchDeleteHandler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { batchId } = req.query;
  if (!batchId) return res.status(400).json({ message: 'Batch ID is required' });

  try {
    await dbConnect();

    const batch = await Batch.findById(batchId);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    // Find all batch items for this batch
    const items = await BatchItem.find({ batch: batch._id });

    // For each batch item, if it references a chat, delete the chat (triggers Chat pre-delete to remove interactions)
    for (const item of items) {
      if (item.chat) {
        try {
          const chat = await Chat.findById(item.chat);
          if (chat) {
            // Use document.deleteOne to ensure document middleware runs
            await chat.deleteOne();
          }
        } catch (e) {
          console.warn('Failed to delete chat for batch item', item._id, e);
        }
      }
    }

    // Remove batch items
    await BatchItem.deleteMany({ batch: batch._id });

    // Finally remove the batch itself
    await Batch.deleteOne({ _id: batch._id });

    return res.status(200).json({ message: 'Batch and related items/chats deleted' });
  } catch (error) {
    console.error('Error deleting batch:', error);
    return res.status(500).json({ message: 'Failed to delete batch', error: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(batchDeleteHandler, authMiddleware, adminMiddleware)(req, res);
}
