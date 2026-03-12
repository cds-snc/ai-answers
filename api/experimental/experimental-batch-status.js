import ExperimentalBatchService from '../../services/experimental/ExperimentalBatchService.js';
import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

/**
 * GET /api/experimental/batch-status/:id
 * Query: ?items=true&page=1&limit=50
 */
async function handler(req, res) {
    try {
        const { id } = req.params;
        const includeItems = req.query.items === 'true';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;

        const batch = await ExperimentalBatchService.getBatch(id);
        if (!batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        const response = { batch };

        if (includeItems) {
            const items = await ExperimentalBatchItem.find({ experimentalBatch: id })
                .sort({ rowIndex: 1 })
                .skip((page - 1) * limit)
                .limit(limit);

            const totalItems = await ExperimentalBatchItem.countDocuments({ experimentalBatch: id });

            response.items = items;
            response.pagination = {
                page,
                limit,
                total: totalItems,
                pages: Math.ceil(totalItems / limit)
            };
        }

        res.json(response);
    } catch (error) {
        console.error('Batch Status Error:', error);
        res.status(500).json({ error: 'Failed to get batch status' });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
