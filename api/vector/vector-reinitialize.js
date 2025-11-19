// api/vector/vector-reinitialize.js
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';
import { initVectorService } from '../../services/VectorServiceFactory.js';
import dbConnect from '../db/db-connect.js';
import { Setting } from '../../models/setting.js';

async function vectorReinitializeHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  await dbConnect();
  try {
    // Check current setting
    const setting = await Setting.findOne({ key: 'vectorServiceType' });
    const type = setting?.value || 'imvectordb';
    // Reinitialize the vector service
    await initVectorService();
    return res.status(200).json({ message: `VectorService reinitialized to type '${type}'` });
  } catch (error) {
    console.error('Error reinitializing VectorService:', error);
    return res.status(500).json({ error: 'Failed to reinitialize VectorService', details: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(vectorReinitializeHandler, authMiddleware, adminMiddleware)(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
