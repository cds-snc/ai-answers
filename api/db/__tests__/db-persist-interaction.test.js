import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import handler from '../db-persist-interaction.js';
import { Chat } from '../../../models/chat.js';
import { Interaction } from '../../../models/interaction.js';
import { Context } from '../../../models/context.js';
import { Question } from '../../../models/question.js';
import { Citation } from '../../../models/citation.js';
import { Answer } from '../../../models/answer.js';
import { Tool } from '../../../models/tool.js';
import EmbeddingService from '../../../services/EmbeddingService.js';

// Mock the dependencies
vi.mock('../../../services/EmbeddingService.js', () => ({
  default: {
    createEmbedding: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../../services/ServerLoggingService.js');

const mongoUri = global.__MONGO_URI__ || process.env.MONGODB_URI;
const describeFn = mongoUri ? describe : describe.skip;

describeFn('db-persist-interaction handler', () => {
  let req, res;

  beforeAll(async () => {
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(() => {
    req = {
      method: 'POST',
      headers: {},
      body: {
        chatId: 'test-chat-id',
        userMessageId: 'test-message-id',
        selectedAI: 'test-ai',
        searchProvider: 'test-provider',
        pageLanguage: 'en',
        responseTime: 1000,
        referringUrl: 'https://test.com',
        context: {
          topic: 'test topic',
          department: 'test dept'
        },
        question: 'test question',
        answer: {
          content: 'test answer content',
          citationUrl: 'https://test-citation.com',
          citationHead: 'Test Citation',
          sentences: ['sentence 1', 'sentence 2'],
          tools: [{
            tool: 'test-tool',
            input: 'test input',
            output: 'test output',
            startTime: new Date(),
            endTime: new Date(),
            duration: 100,
            status: 'completed'
          }]
        },
        confidenceRating: 'high',
        finalCitationUrl: 'https://final-citation.com'
      }
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    // Ensure createEmbedding is a stubbed no-op
    EmbeddingService.createEmbedding.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await Chat.deleteMany({});
    await Interaction.deleteMany({});
    await Context.deleteMany({});
    await Question.deleteMany({});
    await Citation.deleteMany({});
    await Answer.deleteMany({});
    await Tool.deleteMany({});
    vi.clearAllMocks();
  });

  it('should handle method not allowed', async () => {
    req.method = 'GET';
    req.headers = req.headers || {};
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ message: 'Method Not Allowed' });
  });

  it('should successfully persist interaction with embeddings', async () => {
    await handler(req, res);

    // Verify response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Interaction logged successfully' });

    // Verify chat was created
    const chat = await Chat.findOne({ chatId: req.body.chatId });
    expect(chat).toBeTruthy();
    expect(chat.aiProvider).toBe(req.body.selectedAI);
    expect(chat.searchProvider).toBe(req.body.searchProvider);
    expect(chat.pageLanguage).toBe(req.body.pageLanguage);

    // Verify interaction and related documents were created
    const interaction = await Interaction.findOne({ interactionId: req.body.userMessageId })
      .populate('context')
      .populate('question')
      .populate({
        path: 'answer',
        populate: ['citation', 'tools']
      });

    expect(interaction).toBeTruthy();
    // responseTime is stored as a string in the schema
    expect(String(interaction.responseTime)).toBe(String(req.body.responseTime));
    expect(interaction.referringUrl).toBe(req.body.referringUrl);

    // Verify context
    expect(interaction.context).toBeTruthy();
    expect(interaction.context.topic).toBe(req.body.context.topic);
    expect(interaction.context.department).toBe(req.body.context.department);

    // Verify question
    expect(interaction.question).toBeTruthy();
    expect(interaction.question.redactedQuestion).toBe(req.body.question);

    // Verify citation
    expect(interaction.answer.citation).toBeTruthy();
    expect(interaction.answer.citation.aiCitationUrl).toBe(req.body.answer.citationUrl);
    expect(interaction.answer.citation.providedCitationUrl).toBe(req.body.finalCitationUrl);
    expect(interaction.answer.citation.confidenceRating).toBe(req.body.confidenceRating);
    expect(interaction.answer.citation.citationHead).toBe(req.body.answer.citationHead);

    // Verify answer
    expect(interaction.answer).toBeTruthy();
    expect(interaction.answer.content).toBe(req.body.answer.content);

    // Embeddings are handled by EmbeddingService and saved in a separate collection;
    // here we just ensure the service was invoked.
    expect(EmbeddingService.createEmbedding).toHaveBeenCalled();

    // Verify tools
    expect(interaction.answer.tools).toHaveLength(1);
    const tool = interaction.answer.tools[0];
    expect(tool.tool).toBe(req.body.answer.tools[0].tool);
    expect(tool.input).toBe(req.body.answer.tools[0].input);
    expect(tool.output).toBe(req.body.answer.tools[0].output);
    expect(tool.status).toBe(req.body.answer.tools[0].status);
  });

  it('handles embedding generation errors by returning 500', async () => {
    // Force EmbeddingService to fail
    EmbeddingService.createEmbedding.mockRejectedValueOnce(new Error('Embedding generation failed'));

    await handler(req, res);

    // Should respond with error
    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload && payload.message).toBe('Failed to log interaction');
  });

  it('should handle missing optional fields', async () => {
    // Remove optional fields
    delete req.body.answer.tools;
    delete req.body.answer.sentences;
    delete req.body.confidenceRating;
    delete req.body.finalCitationUrl;

    await handler(req, res);

    // Should succeed
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Interaction logged successfully' });

    // Verify documents were created without optional fields
    const interaction = await Interaction.findOne({ interactionId: req.body.userMessageId })
      .populate({
        path: 'answer',
        populate: ['citation', 'tools']
      });

    expect(interaction.answer.tools).toHaveLength(0);
    // sentences should be an empty array when omitted
    expect(Array.isArray(interaction.answer.sentences)).toBe(true);
    expect(interaction.answer.sentences).toHaveLength(0);
    // citation optional fields default to empty string in the schema
    expect(interaction.answer.citation.confidenceRating).toBe('');
    expect(interaction.answer.citation.providedCitationUrl).toBe('');
  });
});
