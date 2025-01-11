import Anthropic from '@anthropic-ai/sdk';
import { getModelConfig } from '../config/ai-models.js';
import dbConnect from './db-connect.js';
import { Batch } from '../models/batch/batch.js';

const modelConfig = getModelConfig('anthropic');
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  headers: {
    'anthropic-beta': modelConfig.beta.messageBatches
  }
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    
    console.log('Batch API request received:', {
      requestCount: req.body.requests?.length,
      systemPromptPresent: !!req.body.requests?.[0]?.systemPrompt,
      firstRequestSample: req.body.requests?.[0]?.message.substring(0, 100)
    });

    if (!req.body.requests || !Array.isArray(req.body.requests)) {
      throw new Error('Invalid requests array in payload');
    }

    
    const batch = await anthropic.beta.messages.batches.create({
      requests: req.body.requests.map((request, index) => ({
        custom_id: `eval-${index}`,
        params: {
          model: modelConfig.name,
          messages: [{ role: "user", content: request.message }],
          max_tokens: modelConfig.maxTokens,
          system: request.systemPrompt,
          temperature: modelConfig.temperature
        }
      }))
    });

    console.log('Batch created successfully:', {
      batchId: batch.id,
      status: batch.processing_status,
      model: modelConfig.name
    });

     // save the batch id and entries
     await dbConnect();
     const savedBatch = new Batch({
         batchId: batch.id,
         type: "question",
         provider: "anthropic",
         entries: req.body.requests.map((request, index) => ({
             entry_id: `eval-${index}`,
             ...request.entry
         }))
     });
     await savedBatch.save();

     console.log('Batch saved:', savedBatch);

    return res.status(200).json({
      batchId: batch.id,
      status: batch.processing_status
    });

  } catch (error) {
    console.error('Batch API error:', {
      message: error.message,
      type: error.constructor.name,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Failed to create batch',
      details: error.message
    });
  }
} 