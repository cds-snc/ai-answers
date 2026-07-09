import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import { requireObjectIdString } from '../util/db-query.js';

// Items that deviated from the reference/baseline answer or errored out.
const ATTENTION_FILTER = { $or: [{ flagged: true }, { match: false }, { status: 'failed' }] };
const ERRORS_FILTER = { status: 'failed' };

const buildItemFilter = (batchId, filter, row) => {
    const base = { experimentalBatch: batchId };
    // Row filter (all trials of one question) overrides verdict filters —
    // used by suite grid cell deep links.
    if (row) return { ...base, rowIndex: row };
    if (filter === 'attention') return { ...base, ...ATTENTION_FILTER };
    if (filter === 'errors') return { ...base, ...ERRORS_FILTER };
    return base;
};

/**
 * GET /api/experimental/experimental-batch-items/:id
 * Query: ?filter=all|attention|errors&page=1&limit=25
 *
 * Paginated batch items for the results drill-down view.
 * `originalData` is excluded to keep the payload small (it can contain
 * downloaded page content used by judges).
 */
async function handler(req, res) {
    try {
        let { id } = req.params;
        id = requireObjectIdString(id, 'id');

        const filter = ['all', 'attention', 'errors'].includes(req.query.filter)
            ? req.query.filter
            : 'all';
        const row = Math.max(parseInt(req.query.row, 10) || 0, 0) || null;
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);

        const batch = await ExperimentalBatch.findById(id)
            .select('name description type status config summary analyzerSummary appVersion createdAt')
            .lean();
        if (!batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        const query = buildItemFilter(id, filter, row);
        const [items, totalItems, counts] = await Promise.all([
            ExperimentalBatchItem.find(query)
                .select('-originalData')
                .sort({ rowIndex: 1, trialIndex: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            ExperimentalBatchItem.countDocuments(query),
            Promise.all([
                ExperimentalBatchItem.countDocuments({ experimentalBatch: id }),
                ExperimentalBatchItem.countDocuments({ experimentalBatch: id, ...ATTENTION_FILTER }),
                ExperimentalBatchItem.countDocuments({ experimentalBatch: id, ...ERRORS_FILTER })
            ]).then(([total, attention, errors]) => ({ total, attention, errors }))
        ]);

        res.json({
            batch,
            items,
            filter,
            row,
            counts,
            pagination: {
                page,
                limit,
                total: totalItems,
                pages: Math.ceil(totalItems / limit) || 1
            }
        });
    } catch (error) {
        console.error('Batch Items Error:', error);
        res.status(500).json({ error: 'Failed to get batch items' });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
