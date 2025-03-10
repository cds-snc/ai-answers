import Anthropic from '@anthropic-ai/sdk';
import { Batch } from '../../models/batch.js';
import dbConnect from '../../api/db/db-connect.js';


const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  headers: {
    'anthropic-beta': 'message-batches-2024-09-24'
  }
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { batchId } = req.query;
  try {
    
    if (!batchId) {
      return res.status(400).json({ error: 'Batch ID is required' });
    }

    await anthropic.beta.messages.batches.cancel(batchId);
    await dbConnect();
    await Batch.findOneAndDelete({ batchId });
    
    return res.status(200).json({ 
      message: 'Cancellation initiated',
      note: 'Cancellation may not take immediate effect'
    });
  } catch (error) {
    await Batch.findOneAndDelete({ batchId });
    console.error('Error canceling batch:', error);
    return res.status(500).json({ 
      error: 'Failed to cancel batch',
      details: error.message 
    });
  }
}