import ExperimentalDatasetService from '../../services/experimental/ExperimentalDatasetService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import { normalizeObjectIdString } from '../util/db-query.js';

const sanitizeFileName = (input = '') => {
    const safe = String(input)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return safe || 'dataset';
};

async function handler(req, res) {
    try {
        const rawId = req.query?.id;
        if (typeof rawId !== 'string' || !rawId.trim()) {
            return res.status(400).json({ error: 'datasetId is required' });
        }

        const id = normalizeObjectIdString(rawId);
        if (!id) {
            return res.status(400).json({ error: 'Invalid datasetId' });
        }

        const result = await ExperimentalDatasetService.exportDataset(id);
        if (!result) {
            return res.status(404).json({ error: 'Dataset not found' });
        }

        const filename = `dataset-${sanitizeFileName(result.dataset.name || id)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(result.csvText);
    } catch (err) {
        console.error('Dataset Export Error:', err);
        return res.status(500).json({ error: err.message });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
