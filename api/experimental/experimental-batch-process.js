import ExperimentalBatchService from '../../services/experimental/ExperimentalBatchService.js';
import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import ExperimentalQueueService from '../../services/experimental/ExperimentalQueueService.js';

const QUEUE_NAME = 'experimental-batch-processing';

/**
 * POST /api/experimental/batch-process/:id
 * Trigger processing for a batch (re-enqueues pending/failed items)
 */
export default async function batchProcessHandler(req, res) {
    try {
        const { id } = req.params;

        const batch = await ExperimentalBatch.findById(id);
        if (!batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        // Find items that are not completed
        const items = await ExperimentalBatchItem.find({
            experimentalBatch: id,
            status: { $ne: 'completed' }
        });

        if (items.length === 0) {
            return res.json({ message: 'Batch already completed', count: 0 });
        }

        batch.status = 'processing';
        await batch.save();

        for (const item of items) {
            // Reset item status
            item.status = 'pending';
            item.error = undefined;
            await item.save();

            await ExperimentalQueueService.enqueue(QUEUE_NAME, {
                batchId: batch._id.toString(),
                itemId: item._id.toString()
            });
        }

        res.json({ message: 'Processing started', count: items.length });

    } catch (error) {
        console.error('Batch Process Error:', error);
        res.status(500).json({ error: 'Failed to process batch' });
    }
}
