import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dbConnect from './db-connect.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import mongoose from 'mongoose';

async function migratePublicFeedbackHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    const ExpertFeedback = mongoose.models.ExpertFeedback;
    const PublicFeedback = mongoose.models.PublicFeedback;
    const Interaction = mongoose.models.Interaction;

    if (!ExpertFeedback || !PublicFeedback || !Interaction) {
      return res.status(400).json({ message: 'Required models not found' });
    }

    const oldPublic = await ExpertFeedback.find({ type: 'public' });
    let migrated = 0;
    for (const fb of oldPublic) {
      const { feedback, publicFeedbackReason, publicFeedbackScore, createdAt, updatedAt } = fb._doc;
      const publicDoc = new PublicFeedback({
        feedback,
        publicFeedbackReason,
        publicFeedbackScore,
        createdAt,
        updatedAt
      });
      await publicDoc.save();
      await Interaction.updateMany({ expertFeedback: fb._id }, {
        $set: { publicFeedback: publicDoc._id },
        $unset: { expertFeedback: 1 }
      });
      await fb.deleteOne();
      migrated++;
    }
    return res.status(200).json({
      message: `Migrated ${migrated} feedback documents`,
      migrated
    });
  } catch (err) {
    console.error('Migration failed', err);
    return res.status(500).json({ message: 'Migration failed', error: err.message });
  }
}

export default function handler(req, res) {
  return withProtection(migratePublicFeedbackHandler, authMiddleware, adminMiddleware)(req, res);
}
