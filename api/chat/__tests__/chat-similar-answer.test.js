import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';

import { setup, teardown, reset } from '../../../test/setup.js';
import mongoose from 'mongoose';

// Silence intermittent Mongo disconnect errors that can occur after teardown
process.on('unhandledRejection', (err) => {
  if (err && err.name === 'MongoNotConnectedError') return;
});

// Mocks for modules used by the handler. These mocks must be registered before
// importing the handler module so imports resolve to the mocks.
const mockMatchQuestions = vi.fn();
const mockInitVectorService = vi.fn();
vi.mock('../../../services/VectorServiceFactory.js', () => ({
  VectorService: { matchQuestions: mockMatchQuestions },
  initVectorService: mockInitVectorService,
}));

const mockFormat = vi.fn();
const mockCreateClient = vi.fn();
const mockClean = vi.fn((s) => s);
vi.mock('../../../services/EmbeddingService.js', () => ({
  default: {
    formatQuestionsForEmbedding: mockFormat,
    createEmbeddingClient: mockCreateClient,
    cleanTextForEmbedding: mockClean,
  },
}));

const mockInvokeWithStrategy = vi.fn();
vi.mock('../../../agents/AgentOrchestratorService.js', () => ({
  AgentOrchestratorService: { invokeWithStrategy: mockInvokeWithStrategy },
}));

vi.mock('../../../agents/AgentFactory.js', () => ({
  createRankerAgent: vi.fn(),
}));

// Do not mock db-connect here; we will connect mongoose to the in-memory server

describe('chat-similar-answer handler', () => {
  let handler;

  beforeAll(async () => {
    // Start in-memory Mongo only if not already configured
    if (!process.env.MONGODB_URI) {
      await setup();
    }
    vi.resetModules();
    global.mongoose = { conn: null, promise: null };
    const dbConnect = (await import('../../../api/db/db-connect.js')).default;
    await dbConnect();

    // Import handler after DB connection and mocks registration in file scope
    handler = (await import('../chat-similar-answer.js')).default;
  });

  beforeEach(async () => {
    vi.resetAllMocks();

    // provide basic embedding client behaviour
    mockCreateClient.mockReturnValue({ embedDocuments: async (arr) => arr.map(() => [0.1, 0.2]) });
    mockFormat.mockImplementation((qs) => Array.isArray(qs) ? qs.map(q => `FORMATTED: ${q}`).join('\n') : `FORMATTED: ${qs}`);

    // Clear database state before each test
    try {
      await reset();
    } catch (_) {}

    // Ensure Answer, Question and Interaction models are registered (db-connect imports them already)
    const AnswerModel = mongoose.model('Answer');
    const QuestionModel = mongoose.model('Question');
    const InteractionModel = mongoose.model('Interaction');

    const [answer1, answer2] = await AnswerModel.create([
      { englishAnswer: 'Answer 1' },
      { englishAnswer: 'Answer 2' },
    ]);

    const [question1, question2] = await QuestionModel.create([
      { englishQuestion: 'Q1', redactedQuestion: 'Q1' },
      { englishQuestion: 'Q2', redactedQuestion: 'Q2' },
    ]);

    await InteractionModel.create([
      { _id: new mongoose.Types.ObjectId('64fec1000000000000000001'), answer: answer1._id, question: question1._id, createdAt: new Date() },
      { _id: new mongoose.Types.ObjectId('64fec1000000000000000002'), answer: answer2._id, question: question2._id, createdAt: new Date() },
    ]);

    // Create a Chat containing these interactions so question flows can be built
    const ChatModel = mongoose.model('Chat');
    const interactions = await mongoose.model('Interaction').find().sort({ _id: 1 }).lean();
    await ChatModel.create({ chatId: 'test-chat', interactions: interactions.map(i => i._id) });

    // Prepare VectorService to return two matches in order
    mockMatchQuestions.mockResolvedValue([[{ id: 'doc1', interactionId: '64fec1000000000000000001' }, { id: 'doc2', interactionId: '64fec1000000000000000002' }]]);

    // Make the ranker choose the second candidate (index 1) with all checks pass
    mockInvokeWithStrategy.mockResolvedValue({ results: [{ index: 1, checks: { numbers: 'pass', dates_times: 'pass', negation: 'pass', entities: 'pass', quantifiers: 'pass', conditionals: 'pass', connectives: 'pass', modifiers: 'pass' } }] });
  });

  afterAll(async () => {
    await teardown();
  });

  it('returns the answer matching the same turn index in the chosen flow', async () => {
    const req = { method: 'POST', body: { questions: ['How to reset password?'], selectedAI: 'openai', language: 'en' } };
    const res = { setHeader: vi.fn(), status: vi.fn(() => res), json: vi.fn(() => res), end: vi.fn() };

    await handler(req, res);

    // Expect VectorService.matchQuestions called with our question
    expect(mockMatchQuestions).toHaveBeenCalled();

    // Expect the orchestrator to have been invoked with formatted questions
    expect(mockInvokeWithStrategy).toHaveBeenCalled();

    // With a single-turn query (index 0), select the first turn answer from the chosen flow
    expect(res.json).toHaveBeenCalled();
    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody).toBeDefined();
    expect(responseBody.answer).toContain('Answer 1');
    expect(responseBody.interactionId.toString()).toBe('64fec1000000000000000001');
    expect(responseBody.reRanked).toBe(true);
  });

  it('uses questions array (conversation history) when provided', async () => {
    const questions = ['How do I apply?', 'What documents are required?'];
    const req = { method: 'POST', body: { questions, selectedAI: 'openai', language: 'en' } };
    const res = { setHeader: vi.fn(), status: vi.fn(() => res), json: vi.fn(() => res), end: vi.fn() };

    await handler(req, res);

    // Ensure VectorService.matchQuestions invoked with the questions array
    expect(mockMatchQuestions).toHaveBeenCalled();
    const firstArgList = mockMatchQuestions.mock.calls[0][0];
    expect(Array.isArray(firstArgList)).toBe(true);
    expect(firstArgList).toEqual(questions);

    // Ensure orchestrator receives formatted userQuestions string (EmbeddingService formats and labels)
    expect(mockInvokeWithStrategy).toHaveBeenCalled();
    const orchestratorArg = mockInvokeWithStrategy.mock.calls[0][0];
    expect(typeof orchestratorArg.request.userQuestions).toBe('string');
    expect(orchestratorArg.request.userQuestions).toContain('FORMATTED:');
    expect(orchestratorArg.request.userQuestions).toContain('How do I apply?');
    expect(orchestratorArg.request.userQuestions).toContain('What documents are required?');

    // Should still return a response body
    expect(res.json).toHaveBeenCalled();
  });

  it('returns the second-turn answer when user is at the second turn', async () => {
    // Ensure ranker returns an ordering that includes both candidates,
    // so the selector can pick the one with enough turns (index 1)
    mockInvokeWithStrategy.mockReset();
    mockInvokeWithStrategy.mockResolvedValue({ results: [
      // First result fails a check, so interpretRankResult skips it
      { index: 0, checks: { numbers: 'fail', dates_times: 'pass', negation: 'pass', entities: 'pass', quantifiers: 'pass', conditionals: 'pass', connectives: 'pass', modifiers: 'pass' } },
      // Second result passes, so index 1 is selected
      { index: 1, checks: { numbers: 'pass', dates_times: 'pass', negation: 'pass', entities: 'pass', quantifiers: 'pass', conditionals: 'pass', connectives: 'pass', modifiers: 'pass' } }
    ] });

    const req = { method: 'POST', body: { questions: ['What is SCIS?', 'Where are the forms?'], selectedAI: 'openai', language: 'en' } };
    const res = { setHeader: vi.fn(), status: vi.fn(() => res), json: vi.fn(() => res), end: vi.fn() };

    await handler(req, res);

    expect(res.json).toHaveBeenCalled();
    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody).toBeDefined();
    // Expect the answer to be for the second turn (interaction 2)
    expect(responseBody.answer).toContain('Answer 2');
    expect(responseBody.interactionId.toString()).toBe('64fec1000000000000000002');
  });

  it('returns empty when ranker yields no usable result (continue normal flow)', async () => {
    // Force ranker to return no results so interpretRankResult -> -1
    mockInvokeWithStrategy.mockResolvedValueOnce({ results: [] });

    const req = { method: 'POST', body: { questions: ['What is SCIS?'], selectedAI: 'openai', language: 'en' } };
    const res = { setHeader: vi.fn(), status: vi.fn(() => res), json: vi.fn(() => res), end: vi.fn() };

    await handler(req, res);

    // Endpoint should not error and should return empty payload
    expect(res.json).toHaveBeenCalledWith({});
  });
});
