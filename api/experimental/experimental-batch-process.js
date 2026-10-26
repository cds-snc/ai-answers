import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import ExperimentalQueueService from '../../services/experimental/ExperimentalQueueService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import mongoose from 'mongoose';

const QUEUE_NAME = 'experimental-batch-processing';
const MAX_ITEM_RETRIES = parseInt(process.env.BATCH_ITEM_MAX_RETRIES, 10) || 3;
const ITEMS_TO_WAIT_FOR = 2;
const WAIT_POLL_MS = 1000;
const WAIT_TIMEOUT_MS = 5 * 60 * 1000;

const getBatchProgress = async (batchId) => {
    const [stats] = await ExperimentalBatchItem.aggregate([
        { $match: { experimentalBatch: new mongoose.Types.ObjectId(batchId) } },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                processing: { $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] } },
                processed: {
                    $sum: {
                        $cond: [{ $in: ['$status', ['completed', 'failed', 'refused']] }, 1, 0]
                    }
                }
            }
        }
    ]);

    return stats || { total: 0, pending: 0, processing: 0, processed: 0 };
};

const waitForBatchProgress = async (batchId, startingProcessed, targetProcessed) => {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;

    while (Date.now() < deadline) {
        const progress = await getBatchProgress(batchId);
        if (progress.processed >= targetProcessed || (progress.pending + progress.processing) === 0) {
            return progress;
        }
        await new Promise(resolve => setTimeout(resolve, WAIT_POLL_MS));
    }

    console.warn('[ExperimentalBatchProcess] Timed out waiting for queued items', {
        batchId,
        startingProcessed,
        targetProcessed
    });
    return getBatchProgress(batchId);
};

/**
 * POST /api/experimental/batch-process/:id
 * Trigger processing for a batch (re-enqueues pending/failed items)
 */
async function handler(req, res) {
    try {
        const { id } = req.params;
        const forceResume = req.query.force === 'true' || req.query.resume === 'true';

        const batch = await ExperimentalBatch.findById(id);
        if (!batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        if (batch.status === 'processing' && !forceResume) {
            return res.status(409).json({ error: 'Batch is already processing' });
        }

        if (batch.status === 'cancelled') {
            return res.status(409).json({ error: 'Cancelled batch cannot be processed again' });
        }

        let startingProgress = null;
        let targetProcessed = null;
        if (forceResume) {
            startingProgress = await getBatchProgress(id);
            const remainingItems = Math.max(startingProgress.total - startingProgress.processed, 0);
            targetProcessed = startingProgress.processed + Math.min(ITEMS_TO_WAIT_FOR, remainingItems);
        }

        if (forceResume) {
            await ExperimentalBatchItem.updateMany(
                { experimentalBatch: id, status: 'processing' },
                { $set: { status: 'pending' }, $unset: { error: 1 } }
            );
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

        const progress = forceResume
            ? await waitForBatchProgress(id, startingProgress.processed, targetProcessed)
            : null;

        res.json({
            message: 'Processing started',
            count: toQueue.length,
            retryEligibleCount: retryEligibleItems.length,
            ...(progress && {
                waitedForItems: Math.max(progress.processed - startingProgress.processed, 0),
                waitTarget: Math.max(targetProcessed - startingProgress.processed, 0)
            })
        });

    } catch (error) {
        console.error('Batch Process Error:', error);
        res.status(500).json({ error: 'Failed to process batch' });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
