import dbConnect from '../db/db-connect.js';
import { normalizeObjectIdString } from '../util/db-query.js';
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';
import EmbeddingMetadataService from '../../services/EmbeddingMetadataService.js';

async function vectorBackfillMetadataHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    const { lastProcessedId = null, limit = 100 } = req.body || {};
    const normalizedLastProcessedId = lastProcessedId
      ? normalizeObjectIdString(lastProcessedId)
      : null;
    if (lastProcessedId && !normalizedLastProcessedId) {
      return res.status(400).json({ error: 'Invalid lastProcessedId' });
    }
    const parsedLimit = Number(limit);
    const boundedLimit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(Math.floor(parsedLimit), 500))
      : 100;

    const result = await EmbeddingMetadataService.backfillBatch({
      lastProcessedId: normalizedLastProcessedId,
      limit: boundedLimit,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error backfilling embedding metadata:', error);
    return res.status(500).json({
      error: 'Failed to backfill embedding metadata',
      details: error.message,
    });
  }
}

export default withProtection(vectorBackfillMetadataHandler, authMiddleware, adminMiddleware);
