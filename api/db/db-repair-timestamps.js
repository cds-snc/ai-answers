import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dbConnect from './db-connect.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import mongoose from 'mongoose';

async function repairTimestampsHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    const connection = await dbConnect();
    
    let stats = {
      tools: { updated: 0, total: 0 }
    };    // Get Tool and Answer models
    const Tool = mongoose.models.Tool;
    const Answer = mongoose.models.Answer;

    if (!Tool || !Answer) {
      return res.status(400).json({ message: 'Required models not found' });
    }// Process Tools - find all tools
    const allTools = await Tool.find({});
    stats.tools.total = allTools.length;

    for (const tool of allTools) {
      // Find the parent Answer that references this tool
      const parentAnswer = await Answer.findOne({ tools: tool._id });
      
      // Use parent Answer's createdAt, fallback to tool's createdAt, then current date
      const updateDate = parentAnswer?.createdAt || tool.createdAt || new Date();
      
      await Tool.updateOne(
        { _id: tool._id },
        { 
          $set: { 
            updatedAt: updateDate
          }
        }
      );
      stats.tools.updated++;
    }

    return res.status(200).json({
      message: 'Tool timestamp repair completed successfully',
      stats
    });

  } catch (error) {
    console.error('Timestamp repair error:', error);
    return res.status(500).json({ 
      message: 'Timestamp repair failed', 
      error: error.message 
    });
  }
}

export default function handler(req, res) {
  return withProtection(repairTimestampsHandler, authMiddleware, adminMiddleware)(req, res);
}
