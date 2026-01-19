import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';

/**
 * GET /api/experimental/batch-export/:id
 */
export default async function batchExportHandler(req, res) {
    try {
        const { id } = req.params;

        // Fetch all items
        const items = await ExperimentalBatchItem.find({ experimentalBatch: id })
            .sort({ rowIndex: 1 })
            .lean();

        res.json(items);
    } catch (error) {
        console.error('Batch Export Error:', error);
        res.status(500).json({ error: 'Failed to export batch' });
    }
}
