import { Batch } from '../../models/batch.js';
import dbConnect from '../../api/db/db-connect.js';
import { Citation } from '../../models/citation.js';
import AnswerService from '../../src/services/AnswerService.js';
import { Answer } from '../../models/answer.js';
import { Context } from '../../models/context.js';
import { createDirectAzureOpenAIClient } from '../../agents/AgentService.js';

const handleAzure = async (batch) => {
  let logString = '';
  try {
    const openai = createDirectAzureOpenAIClient();
    logString += 'Starting batch processing...\n';
    const result = await openai.batches.retrieve(batch.batchId);
    logString += 'Retrieved batch from Azure OpenAI.\n';

    // ...existing code for processing results...
    const fileId = result.error_file_id || result.output_file_id;
    if (!fileId) {
      throw new Error('No file ID found in the batch result');
    }

    const contentStream = (await openai.files.content(fileId)).body;
    const decoder = new TextDecoder();
    let buffer = '';

    // ...existing streaming and processing code...

    batch.status = 'processed';
    await batch.save();
    return { status: 'completed' };

  } catch (error) {
    console.error('Error processing batch incrementally:', error);
    throw error;
  }
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { batchId } = req.query;

      if (!batchId) {
        throw new Error('Batch ID is required');
      }
      await dbConnect();
      
      const batch = await Batch.findOne({ batchId });
      if (!batch) {
        throw new Error('Batch not found');
      }

      const result = await handleAzure(batch);

      return res.status(200).json(result);

    } catch (error) {
      console.error('Error handling request:', error);
      return res.status(500).json({ error: 'Error handling request', details: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}