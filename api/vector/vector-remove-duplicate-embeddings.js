import dbConnect from '../db/db-connect.js';
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';
import EmbeddingMetadataService from '../../services/EmbeddingMetadataService.js';

// Deletes extra embeddings so each interaction keeps one. Safe to re-run.
async function vectorRemoveDuplicateEmbeddingsHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    return res.status(200).json({ success: true, ...(await EmbeddingMetadataService.removeDuplicateEmbeddings()) });
  } catch (error) {
    console.error('Error removing duplicate embeddings:', error);
    return res.status(500).json({ message: 'Failed to remove duplicate embeddings' });
  }
}

export default withProtection(vectorRemoveDuplicateEmbeddingsHandler, authMiddleware, adminMiddleware);
