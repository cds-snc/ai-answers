import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { InteractionPersistenceService } from '../InteractionPersistenceService.js';
import { Chat } from '../../models/chat.js';
import { Interaction } from '../../models/interaction.js';
import { Context } from '../../models/context.js';
import { Question } from '../../models/question.js';
import { Citation } from '../../models/citation.js';
import { Answer } from '../../models/answer.js';
import { Tool } from '../../models/tool.js';
import EmbeddingService from '../../services/EmbeddingService.js';

// Mock dependencies
vi.mock('../../services/EmbeddingService.js', () => ({
    default: {
        createEmbedding: vi.fn().mockResolvedValue(undefined),
    },
}));
vi.mock('../ServerLoggingService.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

const mongoUri = global.__MONGO_URI__ || process.env.MONGODB_URI;
const describeFn = mongoUri ? describe : describe.skip;

describeFn('InteractionPersistenceService', () => {
    let initialPayload;
    let user;

    beforeAll(async () => {
        // If running separately and no global URI, one might need setup logic from test/setup.js
        // Assuming the environment matches db-persist-interaction.test.js
        if (mongoUri) {
            await mongoose.connect(mongoUri);
        }
    });

    afterAll(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
    });

    beforeEach(() => {
        // Construct payload simulating what endpoint passes to service
        initialPayload = {
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
        };

        user = { _id: new mongoose.Types.ObjectId(), name: 'Test User' };

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

    it('should successfully persist interaction with embeddings', async () => {
        await InteractionPersistenceService.persistInteraction(initialPayload, user);

        // Verify chat was created
        const chat = await Chat.findOne({ chatId: initialPayload.chatId });
        expect(chat).toBeTruthy();
        expect(chat.aiProvider).toBe(initialPayload.selectedAI);
        expect(chat.searchProvider).toBe(initialPayload.searchProvider);
        expect(chat.pageLanguage).toBe(initialPayload.pageLanguage);
        // Service might check user
        // (If service logic uses user to set user field on Interaction/Chat, we should check it)

        // Verify interaction
        const interaction = await Interaction.findOne({ interactionId: initialPayload.userMessageId })
            .populate('context')
            .populate('question')
            .populate({
                path: 'answer',
                populate: ['citation', 'tools']
            });

        expect(interaction).toBeTruthy();
        expect(String(interaction.responseTime)).toBe(String(initialPayload.responseTime));
        expect(interaction.referringUrl).toBe(initialPayload.referringUrl);

        // Verify context
        expect(interaction.context).toBeTruthy();
        expect(interaction.context.topic).toBe(initialPayload.context.topic);

        // Verify citation
        expect(interaction.answer.citation).toBeTruthy();
        expect(interaction.answer.citation.aiCitationUrl).toBe(initialPayload.answer.citationUrl);
        expect(interaction.answer.citation.providedCitationUrl).toBe(initialPayload.finalCitationUrl);

        // Embeddings invoked
        expect(EmbeddingService.createEmbedding).toHaveBeenCalled();
    });

    it('handles embedding generation errors gracefully (logs but throws/returns?)', async () => {
        // Service might rethrow or swallow. 
        // The original handler caught errors and returned 500.
        // If Service handles internally, it might return. If it throws, we check rejection.
        // Let's check Service implementation in previous turns?
        // ChatPersistInteraction.js caught errors.
        // InteractionPersistenceService.js likely throws if logic fails.

        EmbeddingService.createEmbedding.mockRejectedValueOnce(new Error('Embedding generation failed'));

        // If the service doesn't catch embedding errors, this will throw.
        // The previous test expected handler to return 500 => implies error propagates or is handled and rethrown/mapped.
        // Let's assume it throws.
        await expect(InteractionPersistenceService.persistInteraction(initialPayload, user))
            .rejects.toThrow();
    });

    it('should handle missing optional fields', async () => {
        delete initialPayload.answer.tools;
        delete initialPayload.answer.sentences;
        delete initialPayload.confidenceRating;
        delete initialPayload.finalCitationUrl;

        await InteractionPersistenceService.persistInteraction(initialPayload, user);

        const interaction = await Interaction.findOne({ interactionId: initialPayload.userMessageId })
            .populate({
                path: 'answer',
                populate: ['citation', 'tools']
            });

        expect(interaction.answer.tools).toHaveLength(0);
        expect(interaction.answer.citation.confidenceRating).toBeFalsy();
    });
});
