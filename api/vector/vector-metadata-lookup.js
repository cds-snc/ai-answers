import dbConnect from '../db/db-connect.js';
import { requireString } from '../util/db-query.js';
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';
import EmbeddingMetadataService from '../../services/EmbeddingMetadataService.js';

async function vectorMetadataLookupHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    let { chatId } = req.query || {};
    if (!chatId) {
      return res.status(400).json({ message: 'chatId is required' });
    }
    chatId = requireString(chatId, 'chatId');
    const result = await EmbeddingMetadataService.lookupForChat(chatId);
    if (!result.chat) {
      return res.status(404).json({ message: 'No chat found for chatId' });
    }
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Error looking up embedding metadata:', error);
    return res.status(500).json({
      message: 'Failed to look up embedding metadata',
      error: error.message,
    });
  }
}

export default withProtection(vectorMetadataLookupHandler, authMiddleware, adminMiddleware);
