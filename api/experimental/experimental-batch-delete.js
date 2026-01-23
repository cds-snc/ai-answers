import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';

/**
 * DELETE /api/experimental/batch-delete/:id
 */
export default async function batchDeleteHandler(req, res) {
    try {
        const { id } = req.params;

        await ExperimentalBatch.findByIdAndDelete(id);
        await ExperimentalBatchItem.deleteMany({ experimentalBatch: id });

        res.json({ success: true });
    } catch (error) {
        console.error('Batch Delete Error:', error);
        res.status(500).json({ error: 'Failed to delete batch' });
    }
}
