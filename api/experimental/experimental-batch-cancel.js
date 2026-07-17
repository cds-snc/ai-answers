import ExperimentalBatchService from '../../services/experimental/ExperimentalBatchService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function handler(req, res) {
    const { id } = req.params;
    try {
        const batch = await ExperimentalBatchService.cancelBatch(id);
        return res.json(batch);
    } catch (err) {
        const status = err.statusCode || (err.code === 'NOT_FOUND' ? 404 : 500);
        return res.status(status).json({ error: err.message, code: err.code });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
