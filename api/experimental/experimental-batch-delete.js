import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

/**
 * DELETE /api/experimental/batch-delete/:id
 */
async function handler(req, res) {
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

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
