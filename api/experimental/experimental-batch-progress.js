import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function handler(req, res) {
    const { id } = req.params;

    try {
        const batch = await ExperimentalBatch.findById(id);
        if (!batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        const progress = {
            status: batch.status,
            completed: batch.summary.completed,
            failed: batch.summary.failed,
            total: batch.summary.total,
            percentComplete: batch.summary.total > 0
                ? Math.round(((batch.summary.completed + batch.summary.failed) / batch.summary.total) * 100)
                : 0,
            analyzerSummary: batch.analyzerSummary
        };

        res.json(progress);
    } catch (err) {
        console.error('Progress API Error:', err);
        res.status(500).json({ error: 'Failed to fetch progress' });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
