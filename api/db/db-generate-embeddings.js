import dbConnect from './db-connect.js';
import { Interaction } from '../../models/interaction.js';
import EmbeddingService from '../../services/EmbeddingService.js';
import config from '../../config/eval.js';

// Updated handler to include regenerate functionality for embeddings
async function regenerateEmbeddingsHandler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { regenerateAll, lastProcessedId, provider = "openai" } = req.body;
        const duration = config.embedBatchProcessingDuration;
        const result = await EmbeddingService.processEmbeddingForDuration(duration, !regenerateAll, lastProcessedId, provider);

        return res.status(200).json({
            completed: result.completed,
            total: result.total,
            remaining: result.remaining,
            lastProcessedId: result.lastProcessedId,
            duration: result.duration
        });
    } catch (error) {
        console.error('Error regenerating embeddings:', error);
        return res.status(500).json({ error: 'Failed to regenerate embeddings', details: error.message });
    }
}

export default regenerateEmbeddingsHandler;