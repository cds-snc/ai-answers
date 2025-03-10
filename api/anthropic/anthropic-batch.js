import Anthropic from '@anthropic-ai/sdk';
import { getModelConfig } from '../../config/ai-models.js';
import dbConnect from '../../api/db/db-connect.js';
import { Batch } from '../../models/batch.js';
import { Question } from '../../models/question.js';
import { Context  } from '../../models/context.js';
import { Interaction } from '../../models/interaction.js';

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
        custom_id: `batch-${index}`,
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
      name: req.body.batchName,
      batchId: batch.id,
      type: "question",
      aiProvider: "anthropic",
      pageLanguage: req.body.lang,
      referringUrl: req.body.referringUrl,
    });
    await savedBatch.save();
    for (const [index, request] of req.body.requests.entries()) {
      const context = new Context({
        ...request.context,
      });
      await context.save();

      // Create Question document
      const question = new Question({
        redactedQuestion: request.message
      });
      await question.save();

      // Create Interaction with references
      let interaction = new Interaction({
        interactionId: `batch-${index}`,
        question: question._id,
        context: context._id
      });
      await interaction.save();

      // Add interaction reference to batch
      savedBatch.interactions.push(interaction._id);
    }
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