import ExperimentalDatasetService from '../../services/experimental/ExperimentalDatasetService.js';
import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function handler(req, res) {
    const { id } = req.params;
    const { force } = req.query;

    try {
        if (force !== 'true') {
            // Check if any batch is using this dataset (in config.datasetId)
            const count = await ExperimentalBatch.countDocuments({ 'config.datasetId': id });
            if (count > 0) {
                return res.status(409).json({
                    error: 'Dataset is in use by active or past batches',
                    code: 'IN_USE',
                    count
                });
            }
        }

        const deleted = await ExperimentalDatasetService.deleteDataset(id);
        if (!deleted) {
            return res.status(404).json({ error: 'Dataset not found' });
        }
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
