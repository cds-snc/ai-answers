import ExperimentalBatchService from '../../services/experimental/ExperimentalBatchService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

/**
 * POST /api/experimental/batch-create
 * Input: { name, description, type, config, items: [ { question, ... }, ... ] }
 */
async function handler(req, res) {
    try {
        const { name, description, type, config, items } = req.body;
        const hasDatasetId = config?.datasetId;

        if (!name || !type || (!hasDatasetId && (!items || !Array.isArray(items) || items.length === 0))) {
            return res.status(400).json({ error: 'Invalid batch input' });
        }

        if (!['batch', 'analysis'].includes(type)) {
            return res.status(400).json({ error: 'Invalid batch type' });
        }

        const batch = await ExperimentalBatchService.createBatch(
            { name, description, type, config, createdBy: req.user?._id },
            items
        );

        res.status(201).json(batch);
    } catch (error) {
        console.error('Create Batch Error:', error);
        const status = error.statusCode || (error.code === 'BAD_REQUEST' || error.code === 'NO_ITEMS' ? 400 : 500);
        res.status(status).json({ error: error.message || 'Failed to create batch', code: error.code });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
