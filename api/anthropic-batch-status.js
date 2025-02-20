import Anthropic from '@anthropic-ai/sdk';
import fetch from 'node-fetch';
import { Batch } from '../models/batch.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  headers: {
    'anthropic-beta': 'message-batches-2024-09-24'
  }
});

export default async function handler(req, res) {
  try {
    const { batchId } = req.query;
    const messageBatch = await anthropic.beta.messages.batches.retrieve(batchId);
    let result = null;
    console.log(`Batch ${messageBatch.id} processing status is ${messageBatch.processing_status}`);

    if (messageBatch.processing_status === 'ended' && messageBatch.results_url) {
      result = {
        status: "completed",
      };
      return res.status(200).json(result);
    } else {
      result = {
        status: "processing",
      };
      return res.status(200).json(result);
    }
  } catch (error) {
    console.error('Error checking batch status:', error);
    return res.status(500).json({ error: 'Error checking batch status', details: error.message });
  }

};




