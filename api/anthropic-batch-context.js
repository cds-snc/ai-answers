import Anthropic from '@anthropic-ai/sdk';
import dbConnect from './db-connect.js';
import { getModelConfig } from '../config/ai-models.js';
import { Batch } from '../models/batch.js';
import { Interaction } from '../models/interaction.js';
import { Context } from '../models/context.js';
import { Question } from '../models/question.js';

const modelConfig = getModelConfig('anthropic', 'claude-3-5-haiku-20241022');
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  headers: {
    'anthropic-beta': modelConfig.beta.messageBatches,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let logString = '';

  try {
    logString += 'Context Batch API request received.\n';
    console.log('Context Batch API request received:', {
      requestCount: req.body.requests?.length,
    });

    if (!req.body.requests || !Array.isArray(req.body.requests)) {
      throw new Error('Invalid requests array in payload');
    }

    const batch = await anthropic.beta.messages.batches.create({
      requests: req.body.requests.map((request, index) => ({
        custom_id: `batch-${index}`,
        params: {
          model: modelConfig.name,
          messages: [{ role: 'user', content: request.message }],
          max_tokens: modelConfig.maxTokens,
          system: `${request.systemPrompt}<searchResults>${request.searchResults.results}</searchResults>`,
          temperature: modelConfig.temperature,
        },
      })),
    });

    // Save to database
    await dbConnect();
    const savedBatch = new Batch({
      batchId: batch.id,
      type: 'context',
      aiProvider: req.body.aiService,
      pageLanguage: req.body.lang,
      name: req.body.batchName,
    });
    await savedBatch.save();

    // Store interactions, contexts, and questions
    for (const [index, request] of req.body.requests.entries()) {
      const context = new Context({
        searchProvider: request.searchProvider,
        searchResults: request.searchResults.results,
      });
      await context.save();

      const question = new Question({
        redactedQuestion: request.message,
      });
      await question.save();

      const interaction = new Interaction({
        interactionId: `batch-${index}`,
        question: question._id,
        context: context._id,
        referringUrl: request.referringUrl,
      });
      await interaction.save();

      savedBatch.interactions.push(interaction._id);
    }
    await savedBatch.save();

    return res.status(200).json({
      batchId: batch.id,
      status: batch.processing_status,
    });
  } catch (error) {
    console.error('Context Batch API error:', {
      message: error.message,
      type: error.constructor.name,
      stack: error.stack,
    });
    return res.status(500).json({
      error: 'Failed to create batch',
      details: error.message,
    });
  }
}
