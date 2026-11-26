import dbConnect from '../db/db-connect.js';
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';
import EmbeddingMetadataService from '../../services/EmbeddingMetadataService.js';

// Read-only: counts interactions that have more than one embedding.
async function vectorDuplicateEmbeddingsHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    return res.status(200).json({ success: true, ...(await EmbeddingMetadataService.getDuplicateEmbeddingStatus()) });
  } catch (error) {
    console.error('Error counting duplicate embeddings:', error);
    return res.status(500).json({ message: 'Failed to count duplicate embeddings' });
  }
}

export default withProtection(vectorDuplicateEmbeddingsHandler, authMiddleware, adminMiddleware);
