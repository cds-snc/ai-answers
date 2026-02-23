import ExperimentalDatasetService from '../../services/experimental/ExperimentalDatasetService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function handler(req, res) {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({ error: 'datasetId is required' });
        }

        const { page, limit } = req.query;
        const result = await ExperimentalDatasetService.getDatasetRows(id, {
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 50
        });

        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
