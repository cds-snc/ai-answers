import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dbConnect from './db-connect.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import mongoose from 'mongoose';

async function repairExpertFeedbackHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  
  try {
    const connection = await dbConnect();
    
    let stats = {
      expertFeedback: { updated: 0, total: 0, alreadyCorrect: 0 }
    };
    
    // Get ExpertFeedback model
    const ExpertFeedback = mongoose.models.ExpertFeedback;

    if (!ExpertFeedback) {
      return res.status(400).json({ message: 'ExpertFeedback model not found' });
    }

    // Find all expert feedback records
    const allFeedback = await ExpertFeedback.find({});
    stats.expertFeedback.total = allFeedback.length;    for (const feedback of allFeedback) {
      // Check if type field doesn't exist, is empty, or is "public"
      if (!feedback.type || feedback.type === '' || feedback.type === 'public') {
        // Set type to "expert" for missing, empty, or "public" type fields
        await ExpertFeedback.updateOne(
          { _id: feedback._id },
          { 
            $set: { 
              type: 'expert'
            }
          }
        );
        stats.expertFeedback.updated++;
      } else if (feedback.type === 'ai') {
        // Leave AI types alone but count them
        stats.expertFeedback.alreadyCorrect++;
      } else if (feedback.type === 'expert') {
        // Already correct, count it
        stats.expertFeedback.alreadyCorrect++;
      } else {
        // Unknown type, set to expert
        await ExpertFeedback.updateOne(
          { _id: feedback._id },
          { 
            $set: { 
              type: 'expert'
            }
          }
        );
        stats.expertFeedback.updated++;
      }
    }

    return res.status(200).json({
      message: 'Expert feedback type repair completed successfully',
      stats
    });

  } catch (error) {
    console.error('Expert feedback repair error:', error);
    return res.status(500).json({ 
      message: 'Expert feedback repair failed', 
      error: error.message 
    });
  }
}

export default function handler(req, res) {
  return withProtection(repairExpertFeedbackHandler, authMiddleware, adminMiddleware)(req, res);
}
