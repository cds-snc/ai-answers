import ExperimentalBatchService from '../../services/experimental/ExperimentalBatchService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function handler(req, res) {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name) return res.status(400).json({ error: 'Dataset name is required' });

    try {
        const result = await ExperimentalBatchService.promoteToDataset(id, {
            name,
            description,
            userId: req.user?._id
        });
        return res.status(201).json(result);
    } catch (err) {
        const status = err.statusCode || (err.code === 'NOT_FOUND' ? 404 : err.code === 'DUPLICATE' || err.code === 'INVALID_STATE' ? 409 : 500);
        return res.status(status).json({ error: err.message, code: err.code });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
