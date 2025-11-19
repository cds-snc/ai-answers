import dbConnect from '../db/db-connect.js';
import { Batch } from '../../models/batch.js';
import { BatchItem } from '../../models/batchItem.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function batchPersistHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const batchData = req.body;
    console.log(`[batch-persist] called with:`, batchData);
    if (!batchData) return res.status(400).json({ message: 'Missing batch data' });

    await dbConnect();

    // If a batchId is provided, update the existing batch (or upsert when not found).
    if (batchData._id) {
      console.log(`[batch-persist] updating existing batch ${batchData._id}`);
     
      const updated = await Batch.findOneAndUpdate(
        { _id: batchData._id },
        { $set: batchData },
        { new: true, upsert: true }
      );
      console.log(`[batch-persist] updated result:`, updated ? { _id: updated._id } : null);

      if (!updated) {
        return res.status(404).json({ message: 'Batch not found' });
      }

      return res.status(200).json(updated);
    }

    // No batchId provided: create a new batch and generate a batchId if missing
    if (!batchData._id) {
      console.log(`[batch-persist] creating new batch (batchId will be set to _id) with ${batchData.items?.length || 0} items`);
      const batch = new Batch(batchData);
      await batch.save();

      // For compatibility and to avoid confusion, set the batchId field to the
      // string value of the Mongo-generated _id. This lets callers continue
      // using `batchId` while we standardize on the document _id.
      batch.batchId = batch._id.toString();
      await batch.save();

      // If caller included items (simple option A), create BatchItem docs linked to this batch.
      // Expect items to be an array of { rowIndex?, originalData? }
      if (Array.isArray(batchData.items) && batchData.items.length) {
        try {
          const toInsert = batchData.items.map((it, idx) => ({
            batch: batch._id,
            rowIndex: it?.rowIndex ?? idx,
            originalData: it?.originalData ?? it ?? {},
          }));
          console.log(`[batch-persist] creating ${toInsert.length} BatchItems`);
          await BatchItem.insertMany(toInsert, { ordered: false });
        } catch (err) {
          // Log and continue - item creation shouldn't block batch creation
          console.error('Failed to create batch items:', err);
        }
      }
      return res.status(201).json(batch);
    }


  } catch (error) {
    console.error('Error persisting batch:', error);
    return res.status(500).json({ message: 'Failed to persist batch', error: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(batchPersistHandler, authMiddleware, adminMiddleware)(req, res);
}
