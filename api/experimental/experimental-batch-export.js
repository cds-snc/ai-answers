import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

/**
 * GET /api/experimental/batch-export/:id
 */
async function handler(req, res) {
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

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
