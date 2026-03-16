import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import ExperimentalQueueService from '../../services/experimental/ExperimentalQueueService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import mongoose from 'mongoose';

const QUEUE_NAME = 'experimental-batch-processing';
const MAX_ITEM_RETRIES = parseInt(process.env.BATCH_ITEM_MAX_RETRIES, 10) || 3;

/**
 * POST /api/experimental/batch-process/:id
 * Trigger processing for a batch (re-enqueues pending/failed items)
 */
async function handler(req, res) {
    try {
        const { id } = req.params;

        const batch = await ExperimentalBatch.findById(id);
        if (!batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        if (batch.status === 'processing') {
            return res.status(409).json({ error: 'Batch is already processing' });
        }

        if (batch.status === 'cancelled') {
            return res.status(409).json({ error: 'Cancelled batch cannot be processed again' });
        }

        const retryEligibleItems = await ExperimentalBatchItem.find({
            experimentalBatch: id,
            status: { $in: ['pending', 'failed'] },
            retryCount: { $lt: MAX_ITEM_RETRIES }
        }).select('_id status');

        if (retryEligibleItems.length === 0) {
            return res.json({
                message: 'No pending/failed items eligible for processing',
                count: 0
            });
        }

        const retryEligibleIds = retryEligibleItems.map(i => i._id);
        const failedIds = retryEligibleItems
            .filter(i => i.status === 'failed')
            .map(i => i._id);

        if (failedIds.length > 0) {
            await ExperimentalBatchItem.updateMany(
                { _id: { $in: failedIds } },
                { $set: { status: 'pending' }, $unset: { error: 1 } }
            );
        }

        const independentItems = await ExperimentalBatchItem.find({
            _id: { $in: retryEligibleIds },
            status: 'pending',
            $or: [{ chatId: { $exists: false } }, { chatId: null }, { chatId: '' }]
        }).select('_id');

        const groupedHeadItems = await ExperimentalBatchItem.aggregate(
            [
                {
                    $match: {
                        experimentalBatch: new mongoose.Types.ObjectId(id),
                        status: 'pending',
                        _id: { $in: retryEligibleIds },
                        chatId: { $nin: [null, ''] }
                    }
                },
                { $sort: { chatId: 1, rowIndex: 1 } },
                {
                    $group: {
                        _id: '$chatId',
                        itemId: { $first: '$_id' }
                    }
                }
            ]
        );

        const toQueue = [
            ...independentItems.map(i => i._id.toString()),
            ...groupedHeadItems.map(g => g.itemId.toString())
        ];

        if (toQueue.length === 0) {
            return res.json({
                message: 'No rows to enqueue after grouping',
                count: 0
            });
        }

        batch.status = 'processing';
        await batch.save();

        for (const itemId of toQueue) {
            await ExperimentalQueueService.enqueue(QUEUE_NAME, {
                batchId: batch._id.toString(),
                itemId
            });
        }

        res.json({
            message: 'Processing started',
            count: toQueue.length,
            retryEligibleCount: retryEligibleItems.length
        });

    } catch (error) {
        console.error('Batch Process Error:', error);
        res.status(500).json({ error: 'Failed to process batch' });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
