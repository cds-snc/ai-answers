import dbConnect from './db-connect.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import mongoose from 'mongoose';

// NOTE: We dynamically enumerate `mongoose.models` after ensuring models
// have been registered (db-connect imports model files). This avoids maintaining
// a hard-coded list and keeps the export/dropdown and table counts in sync.

async function tableCountsHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    await dbConnect();
    const counts = {};
    // Use mongoose.models so any model imported/registered at startup is counted
    for (const [name, Model] of Object.entries(mongoose.models)) {
      try {
        counts[name] = await Model.countDocuments();
      } catch (e) {
        // If counting fails for a model, set to null to indicate unknown
        counts[name] = null;
        console.warn(`Failed to count documents for model ${name}:`, e.message);
      }
    }
    res.status(200).json({ counts });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get table counts', error: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(tableCountsHandler, authMiddleware, adminMiddleware)(req, res);
}
