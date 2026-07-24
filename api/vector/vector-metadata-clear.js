import dbConnect from '../db/db-connect.js';
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';
import EmbeddingMetadataService from '../../services/EmbeddingMetadataService.js';

async function vectorMetadataClearHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
  try {
    await dbConnect();
    const result = await EmbeddingMetadataService.clearAllMetadata();
    return res.status(200).json({ success: true, modifiedCount: result.modifiedCount || 0 });
  } catch (error) {
    console.error('Error clearing embedding metadata:', error);
    return res.status(500).json({ message: 'Failed to clear embedding metadata', error: error.message });
  }
}

export default withProtection(vectorMetadataClearHandler, authMiddleware, adminMiddleware);
