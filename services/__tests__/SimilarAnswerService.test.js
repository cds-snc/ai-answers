import { describe, it, expect, vi, beforeEach, afterAll, beforeAll, afterEach } from 'vitest';
import { setup, teardown, reset } from '../../test/setup.js';
import mongoose from 'mongoose';

// Declare mocks before importing the module under test
vi.mock('../VectorServiceFactory.js', () => ({
    VectorService: { matchQuestions: vi.fn() },
    initVectorService: vi.fn(),
}));

vi.mock('../EmbeddingService.js', () => ({
    default: {
        formatQuestionsForEmbedding: vi.fn(),
        createEmbeddingClient: vi.fn(),
        cleanTextForEmbedding: vi.fn((s) => s),
    },
}));

vi.mock('../ServerLoggingService.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    }
}));

vi.mock('../../agents/AgentOrchestratorService.js', () => ({
    AgentOrchestratorService: { invokeWithStrategy: vi.fn() },
}));

vi.mock('../../agents/AgentFactory.js', () => ({
    createRankerAgent: vi.fn(),
}));

import { SimilarAnswerService } from '../SimilarAnswerService.js';
// Import mocked modules to control them
import { VectorService } from '../VectorServiceFactory.js';
import EmbeddingService from '../EmbeddingService.js';
import { AgentOrchestratorService } from '../../agents/AgentOrchestratorService.js';

// Silence intermittent Mongo disconnect errors
process.on('unhandledRejection', (err) => {
    if (err && err.name === 'MongoNotConnectedError') return;
});

// (mocks declared above before imports)

describe('SimilarAnswerService', () => {
    let AnswerModel, QuestionModel, InteractionModel, ChatModel;
    const createdAnswerIDs = [];
    const createdQuestionIDs = [];
    const createdInteractionIDs = [];
    const createdChatIDs = [];

    const fixedInteractionIds = [
        new mongoose.Types.ObjectId('64fec1000000000000000001'),
        new mongoose.Types.ObjectId('64fec1000000000000000002'),
    ];

    beforeAll(async () => {
        if (!process.env.MONGODB_URI) {
            await setup();
        }
        // Ensure in-memory DB is available and connect
        const dbConnect = (await import('../../api/db/db-connect.js')).default;
        await dbConnect();

        // Ensure models are registered (db-connect imports them, but just to be safe/clear)
        AnswerModel = mongoose.model('Answer');
        QuestionModel = mongoose.model('Question');
        InteractionModel = mongoose.model('Interaction');
        ChatModel = mongoose.model('Chat');
    });

    beforeEach(async () => {
        vi.clearAllMocks(); // Use clearAllMocks instead of resetAllMocks to keep implementations if any (but we set them below)

        // Setup default mock behaviors
        EmbeddingService.createEmbeddingClient.mockReturnValue({ embedDocuments: async (arr) => arr.map(() => [0.1, 0.2]) });
        EmbeddingService.formatQuestionsForEmbedding.mockImplementation((qs) => Array.isArray(qs) ? qs.map(q => `FORMATTED: ${q}`).join('\n') : `FORMATTED: ${qs}`);

        // Default: Return 2 matches
        VectorService.matchQuestions.mockResolvedValue([[{ id: 'doc1', interactionId: '64fec1000000000000000001' }, { id: 'doc2', interactionId: '64fec1000000000000000002' }]]);

        // Default: Ranker picks index 0 (all pass)
        AgentOrchestratorService.invokeWithStrategy.mockResolvedValue({
            results: [{ index: 0, checks: { numbers: 'pass', dates_times: 'pass' } }]
        });

        const [answer1, answer2] = await AnswerModel.create([
            { englishAnswer: 'Answer 1' },
            { englishAnswer: 'Answer 2' },
        ]);
        createdAnswerIDs.push(answer1._id, answer2._id);
        
        const [question1, question2] = await QuestionModel.create([
            { englishQuestion: 'Q1', redactedQuestion: 'Q1' },
            { englishQuestion: 'Q2', redactedQuestion: 'Q2' },
        ]);
        createdQuestionIDs.push(question1._id, question2._id);

        const now = Date.now();
        await InteractionModel.create([
            { _id: fixedInteractionIds[0], answer: answer1._id, question: question1._id, createdAt: new Date(now) },        // Newer (index 0)
            { _id: fixedInteractionIds[1], answer: answer2._id, question: question2._id, createdAt: new Date(now - 10000) }, // Older (index 1)
        ]);
        const interactions = await mongoose.model('Interaction').find().sort({ _id: 1 }).lean();
        createdInteractionIDs.push(...fixedInteractionIds);

        await ChatModel.create({ chatId: 'test-chat', interactions: interactions.map(i => i._id) });
        createdChatIDs.push('test-chat');
    });

    afterAll(async () => {
        // Shared teardown handled globally
    });

    afterEach(async () => {
        await AnswerModel.deleteMany({ _id: { $in: createdAnswerIDs } });
        await QuestionModel.deleteMany({ _id: { $in: createdQuestionIDs } });
        await InteractionModel.deleteMany({ _id: { $in: createdInteractionIDs } });
        await ChatModel.deleteMany({ chatId: { $in: createdChatIDs } });
    });

    it('uses questions array (conversation history) when provided', async () => {
        const questions = ['How do I apply?', 'What documents are required?'];
        const params = {
            questions,
            selectedAI: 'openai',
            pageLanguage: 'en',
            chatId: 'test-chat'
        };

        await SimilarAnswerService.findSimilarAnswer(params);

        expect(VectorService.matchQuestions).toHaveBeenCalled();
        const firstArgList = VectorService.matchQuestions.mock.calls[0][0];
        expect(firstArgList).toEqual(questions);
    });


    it('returns null when ranker yields no usable result', async () => {
        AgentOrchestratorService.invokeWithStrategy.mockResolvedValueOnce({ results: [] });

        const params = {
            questions: ['What is SCIS?'],
            selectedAI: 'openai',
            pageLanguage: 'en',
            chatId: 'test-chat'
        };

        const result = await SimilarAnswerService.findSimilarAnswer(params);
        expect(result).toBeNull();
    });
});
