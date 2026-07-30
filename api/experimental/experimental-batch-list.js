import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

/**
 * GET /api/experimental/batch-list
 */
async function handler(req, res) {
    try {
        const isDataTablesRequest = req.query.start !== undefined || req.query.length !== undefined;
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

        const search = String(req.query.search || '').trim();
        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { name: { $regex: escaped, $options: 'i' } },
                { description: { $regex: escaped, $options: 'i' } },
                { status: { $regex: escaped, $options: 'i' } },
                { 'config.workflow': { $regex: escaped, $options: 'i' } },
                { 'config.aiProvider': { $regex: escaped, $options: 'i' } }
            ];
        }

        const total = await ExperimentalBatch.countDocuments({
            ...(rawType !== undefined ? { type: rawType } : {}),
            ...(req.query.datasetId ? { 'config.datasetId': req.query.datasetId } : {})
        });
        const filtered = await ExperimentalBatch.countDocuments(query);
        const skip = isDataTablesRequest ? Math.max(0, parseInt(req.query.start) || 0) : (page - 1) * limit;
        const take = isDataTablesRequest ? Math.max(1, parseInt(req.query.length) || 10) : limit;
        const sortFields = new Set(['createdAt', 'name', 'status', 'summary.completed', 'summary.failed', 'summary.total']);
        const orderBy = sortFields.has(req.query.orderBy) ? req.query.orderBy : 'createdAt';
        const orderDir = req.query.orderDir === 'asc' ? 1 : -1;

        const batches = await ExperimentalBatch.find(query)
            .populate('createdBy', 'email')
            .sort({ [orderBy]: orderDir })
            .skip(skip)
            .limit(take);

        res.json({
            data: batches,
            recordsTotal: total,
            recordsFiltered: filtered,
            pagination: {
                page,
                limit: take,
                total: filtered,
                pages: Math.ceil(filtered / take)
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
