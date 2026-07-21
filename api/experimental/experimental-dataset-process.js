import ExperimentalDatasetService from '../../services/experimental/ExperimentalDatasetService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import { requireObjectIdString } from '../util/db-query.js';

async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const id = requireObjectIdString(req.params.id, 'datasetId');
        const result = await ExperimentalDatasetService.queueInstantAnswerDataset(id, {
            force: req.query.force === 'true'
        });
        return res.json(result);
    } catch (err) {
        if (err.code === 'stillProcessing') return res.status(409).json({ error: err.message, code: err.code });
        if (err.message === 'Dataset not found') return res.status(404).json({ error: err.message });
        return res.status(500).json({ error: err.message || 'Failed to queue dataset processing' });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
