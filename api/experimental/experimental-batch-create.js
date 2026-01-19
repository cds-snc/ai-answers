import ExperimentalBatchService from '../../services/experimental/ExperimentalBatchService.js';

/**
 * POST /api/experimental/batch-create
 * Input: { name, description, type, config, items: [ { question, ... }, ... ] }
 */
export default async function batchCreateHandler(req, res) {
    try {
        const { name, description, type, config, items } = req.body;

        if (!name || !type || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Invalid batch input' });
        }

        if (!['batch', 'analysis'].includes(type)) {
            return res.status(400).json({ error: 'Invalid batch type' });
        }

        const batch = await ExperimentalBatchService.createBatch(
            { name, description, type, config },
            items
        );

        res.status(201).json(batch);
    } catch (error) {
        console.error('Create Batch Error:', error);
        res.status(500).json({ error: 'Failed to create batch' });
    }
}
