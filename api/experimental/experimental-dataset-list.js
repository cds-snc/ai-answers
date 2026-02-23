import ExperimentalDatasetService from '../../services/experimental/ExperimentalDatasetService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function handler(req, res) {
    try {
        const { page, limit } = req.query;
        const result = await ExperimentalDatasetService.list({
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 20
        });
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
