import dbConnect from '../db/db-connect.js';
import { Batch } from '../../models/batch.js';
import { BatchItem } from '../../models/batchItem.js';
import { Chat } from '../../models/chat.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function batchItemsUpsertHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { batchId, items } = req.body || {};
    console.log(`[batch-items-upsert] called with batchId=${batchId} items.length=${items?.length}`);
    if (!batchId) return res.status(400).json({ message: 'Missing batchId' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'Missing items array' });

    await dbConnect();

    const findChatWithRetries = async (chatId, attempts = 6, delayMs = 500) => {
      if (!chatId) return null;
      await new Promise((r) => setTimeout(r, delayMs));
      for (let i = 0; i < attempts; i++) {
        try {
          const found = await Chat.findOne({ chatId });
          if (found) return found;
        } catch (e) {
          // ignore DB read errors and retry
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
      return null;
    };

    const batch = await Batch.findById(batchId);
    console.log(`[batch-items-upsert] found batch:`, batch ? { _id: batch._id } : null);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    const results = [];

    for (const it of items) {
      try {
        const rowIndex = (it && typeof it.rowIndex === 'number') ? it.rowIndex : undefined;

        if (typeof rowIndex === 'number') {
          const update = { $set: { originalData: it?.originalData ?? it ?? {} } };

          if (it.chat) {
            try {
              if (typeof it.chat === 'string') {
                const found = await findChatWithRetries(it.chat, 6, 500);
                if (found) update.$set.chat = found._id;
                else update.$set.chat = it.chat;
              } else {
                update.$set.chat = it.chat;
              }
            } catch (e) {
              update.$set.chat = it.chat;
            }
          }

          if (it.error !== undefined) update.$set.error = it.error;
          if (it.shortQuery !== undefined) update.$set.shortQuery = it.shortQuery;

          const upserted = await BatchItem.findOneAndUpdate(
            { batch: batch._id, rowIndex },
            update,
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          console.log(`[batch-items-upsert] upserted item rowIndex=${rowIndex} id=${upserted._id}`);

          results.push({ rowIndex, id: upserted._id, action: 'upsert' });
        } else {
          let chatVal = undefined;
          if (it && it.chat) {
            try {
              if (typeof it.chat === 'string') {
                const found = await findChatWithRetries(it.chat, 6, 500);
                if (found) chatVal = found._id;
                else chatVal = it.chat;
              } else {
                chatVal = it.chat;
              }
            } catch (e) {
              chatVal = it.chat;
            }
          }

          const toInsert = {
            batch: batch._id,
            rowIndex: it?.rowIndex ?? undefined,
            originalData: it?.originalData ?? it ?? {},
            error: it?.error ?? undefined,
            shortQuery: it?.shortQuery ?? undefined,
            ...(chatVal ? { chat: chatVal } : {}),
          };

          try {
            const created = await BatchItem.create(toInsert);
            results.push({ rowIndex: created.rowIndex, id: created._id, action: 'created' });
          } catch (e) {
            console.error('Failed to create batch item:', e);
            results.push({ rowIndex: it?.rowIndex, error: e.message || String(e) });
          }
        }
      } catch (err) {
        console.error('Error upserting item:', err);
        results.push({ rowIndex: it?.rowIndex, error: err.message || String(err) });
      }
    }

    console.log(`[batch-items-upsert] processed ${results.length} items`);
    return res.status(200).json({ ok: true, results });
  } catch (error) {
    console.error('Error in batch-items-upsert:', error);
    return res.status(500).json({ message: 'Failed to upsert batch items', error: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(batchItemsUpsertHandler, authMiddleware, adminMiddleware)(req, res);
}
