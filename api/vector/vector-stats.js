// api/vector/vector-stats.js
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';
import { VectorService } from '../../services/VectorServiceFactory.js';

async function vectorStatsHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
  const stats = await VectorService.getStats();
  return res.status(200).json(stats);
  } catch (error) {
    console.error('Error fetching vector stats:', error);
    return res.status(500).json({ error: 'Failed to fetch vector stats', details: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(vectorStatsHandler, authMiddleware, adminMiddleware)(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
