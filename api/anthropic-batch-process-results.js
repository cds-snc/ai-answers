import Anthropic from '@anthropic-ai/sdk';
import { Batch } from '../models/batch.js';
import dbConnect from './db-connect.js';
import { Context } from '../models/context.js';
import { Question } from '../models/question.js';
import { Answer } from '../models/answer.js';
import ContextService from '../src/services/ContextService.js';
import AnswerService from '../src/services/AnswerService.js';
import { Citation } from '../models/citation.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  headers: {
    'anthropic-beta': 'message-batches-2024-09-24',
  },
});

const handleAnthropic = async (batch) => {
  try {
    const resultsStream = await anthropic.beta.messages.batches.results(batch.batchId);

    for await (const result of resultsStream) {
      const customId = result.custom_id;
      batch = await Batch.findById(batch._id).populate('interactions');
      const interaction = batch.interactions.find(
        (interaction) => interaction.interactionId === customId
      );
      if (interaction) {
        if (batch.type === 'context') {
          // TODO fix this when services moved to server side
          const response = result.result.message.content[0].text;
          const topicMatch = response.match(/<topic>([\s\S]*?)<\/topic>/);
          const topicUrlMatch = response.match(/<topicUrl>([\s\S]*?)<\/topicUrl>/);
          const departmentMatch = response.match(/<department>([\s\S]*?)<\/department>/);
          const departmentUrlMatch = response.match(/<departmentUrl>([\s\S]*?)<\/departmentUrl>/);

          let context = await Context.findById(interaction.context);
          context.topic = topicMatch ? topicMatch[1] : context.topic;
          context.topicUrl = topicUrlMatch ? topicUrlMatch[1] : context.topicUrl;
          context.department = departmentMatch ? departmentMatch[1] : context.department;
          context.departmentUrl = departmentUrlMatch
            ? departmentUrlMatch[1]
            : context.departmentUrl;
          context.model = result.result.message.model;
          context.inputTokens = result.result.message.usage.input_tokens;
          context.outputTokens = result.result.message.usage.output_tokens;
          context.cachedCreationInputTokens =
            result.result.message.usage.cache_creation_input_tokens;
          context.cachedReadInputTokens = result.result.message.usage.cache_read_input_tokens;
          await context.save();
        } else {
          const parsedAnswer = AnswerService.parseResponse(result.result.message.content[0].text);

          const citation = new Citation();
          citation.aiCitationUrl = parsedAnswer.citationUrl;
          // TODO this should be fixed
          //citation.providedCitationUrl = ChatPiplineService.verifyCitation(parsedMessage.finalCitationUrl);
          citation.confidenceRating = parsedAnswer.confidenceRating;
          citation.citationHead = parsedAnswer.citationHead;
          await citation.save();

          const answer = new Answer();
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

    batch.status = 'processed';
    await batch.save();
    return {
      status: 'completed',
    };
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

      let result = await handleAnthropic(batch);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Error handling request:', error);
      return res.status(500).json({ error: 'Error handling request', log: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
