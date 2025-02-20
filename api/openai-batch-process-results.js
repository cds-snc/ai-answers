import { Batch } from '../models/batch.js';
import OpenAI from 'openai';
import dbConnect from './db-connect.js';
import { Citation } from '../models/citation.js';
import AnswerService from '../src/services/AnswerService.js';
import { Answer } from '../models/answer.js';
import { Context } from '../models/context.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const handleOpenAI = async (batch) => {
  let logString = '';
  try {
    logString += 'Starting batch processing...\n';
    const result = await openai.batches.retrieve(batch.batchId);
    logString += 'Retrieved batch from OpenAI.\n';

    const fileId = result.error_file_id || result.output_file_id;
    if (!fileId) {
      throw new Error('No file ID found in the batch result');
    }

    const contentStream = (await openai.files.content(fileId)).body;
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of contentStream) {
      // Decode chunk to string
      const text = decoder.decode(chunk, { stream: true });
      buffer += text;

      while (true) {
        // Split on newlines
        let lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // Retain incomplete line

        for (const line of lines) {
          if (!line.trim()) continue; // Skip empty lines

          const result = JSON.parse(line.trim());
          const customId = result.custom_id;
          batch = await Batch.findById(batch._id).populate('interactions');
          const interaction = batch.interactions.find(
            (interaction) => interaction.interactionId === customId
          );

          if (interaction) {
            if (batch.type === 'context') {
              const response = result.response.body.choices[0].message.content;
              const topicMatch = response.match(/<topic>([\s\S]*?)<\/topic>/);
              const topicUrlMatch = response.match(/<topicUrl>([\s\S]*?)<\/topicUrl>/);
              const departmentMatch = response.match(/<department>([\s\S]*?)<\/department>/);
              const departmentUrlMatch = response.match(
                /<departmentUrl>([\s\S]*?)<\/departmentUrl>/
              );

              let context = await Context.findById(interaction.context);
              context.topic = topicMatch ? topicMatch[1] : context.topic;
              context.topicUrl = topicUrlMatch ? topicUrlMatch[1] : context.topicUrl;
              context.department = departmentMatch ? departmentMatch[1] : context.department;
              context.departmentUrl = departmentUrlMatch
                ? departmentUrlMatch[1]
                : context.departmentUrl;
              context.model = result.response.body.model;
              (context.inputTokens = result.response.body.usage.prompt_tokens),
                (context.outputTokens = result.response.body.usage.completion_tokens),
                await context.save();
            } else {
              // TODO put this in common place
              const parsedAnswer = AnswerService.parseResponse(
                result.response.body.choices[0].message.content
              );

              const citation = new Citation();
              citation.aiCitationUrl = parsedAnswer.citationUrl;
              // TODO this should be fixed
              //citation.providedCitationUrl = ChatPiplineService.verifyCitation(parsedMessage.finalCitationUrl);
              citation.confidenceRating = parsedAnswer.confidenceRating;
              citation.citationHead = parsedAnswer.citationHead;
              await citation.save();

              const answer = new Answer();
              answer.inputTokens = result.response.body.usage.prompt_tokens;
              answer.outputTokens = result.response.body.usage.completion_tokens;
              answer.model = result.response.body.model;
              answer.citation = citation._id;
              Object.assign(answer, parsedAnswer);
              answer.sentences = parsedAnswer.sentences;
              await answer.save();
              interaction.answer = answer._id;

              await interaction.save();
              await batch.save();
            }
          }
        }

        // Exit the loop if no complete lines remain in the buffer
        if (!buffer.includes('\n')) {
          break;
        }
      }
    }

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

      const result = await handleOpenAI(batch);

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
