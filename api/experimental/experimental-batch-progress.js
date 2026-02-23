import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function handler(req, res) {
    const { id } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendUpdate = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const interval = setInterval(async () => {
        try {
            const batch = await ExperimentalBatch.findById(id);
            if (!batch) {
                sendUpdate({ error: 'Batch not found' });
                clearInterval(interval);
                res.end();
                return;
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

            sendUpdate(progress);

            if (['completed', 'failed', 'cancelled'].includes(batch.status)) {
                clearInterval(interval);
                res.end();
            }
        } catch (err) {
            console.error('SSE Progress Error:', err);
            clearInterval(interval);
            res.end();
        }
    }, 2000);

    req.on('close', () => {
        clearInterval(interval);
        res.end();
    });
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
