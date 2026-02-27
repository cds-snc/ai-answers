import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

/**
 * GET /api/experimental/batch-list
 */
async function handler(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const rawType = req.query.type;

        const query = {};
        if (rawType !== undefined) {
            query.type = rawType;
        }
        if (req.query.datasetId) {
            query['config.datasetId'] = req.query.datasetId;
        }

        const batches = await ExperimentalBatch.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await ExperimentalBatch.countDocuments(query);

        res.json({
            data: batches,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('List Batches Error:', error);
        res.status(500).json({ error: 'Failed to list batches' });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
