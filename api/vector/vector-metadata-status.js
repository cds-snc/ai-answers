import dbConnect from '../db/db-connect.js';
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';
import EmbeddingMetadataService from '../../services/EmbeddingMetadataService.js';

async function vectorMetadataStatusHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(200).json({ success: true, ...(await EmbeddingMetadataService.getBackfillStatus()) });
  } catch (error) {
    console.error('Error checking embedding metadata status:', error);
    return res.status(500).json({ message: 'Failed to check embedding metadata status', error: error.message });
  }
}

export default withProtection(vectorMetadataStatusHandler, authMiddleware, adminMiddleware);
