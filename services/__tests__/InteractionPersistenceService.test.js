import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Mock dependencies before importing the service under test
vi.mock('../EmbeddingService.js', () => ({
    default: {
        createEmbedding: vi.fn().mockReturnValue(Promise.resolve()),
    },
}));
vi.mock('../EvaluationService.js', () => {
    const mock = { evaluateInteraction: vi.fn(() => Promise.resolve({})) };
    return { default: mock, ...mock };
});
vi.mock('../ServerLoggingService.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

// Import the mocked ServerLoggingService so tests can assert on it
import ServerLoggingService from '../ServerLoggingService.js';

import { InteractionPersistenceService } from '../InteractionPersistenceService.js';
import { Chat } from '../../models/chat.js';
import { Interaction } from '../../models/interaction.js';
import { Context } from '../../models/context.js';
import { Question } from '../../models/question.js';
import { Citation } from '../../models/citation.js';
import { Answer } from '../../models/answer.js';
import { Tool } from '../../models/tool.js';
import EmbeddingService from '../EmbeddingService.js';
import EvaluationService from '../EvaluationService.js';

describe('InteractionPersistenceService', () => {
    let initialPayload;
    let user;
    let mongoServer;

    beforeAll(async () => {
        const dbConnect = (await import('../../api/db/db-connect.js')).default;
        await dbConnect();
    });

    afterAll(async () => {
        // We do not disconnect or stop mongoServer here to avoid killing 
        // the database for other tests running in the same process.
        // Deployment teardown is handled by the global setup/teardown.
    });

    beforeEach(() => {
        // Use unique IDs to prevent collisions when running full test suite
        const uniqueId = new mongoose.Types.ObjectId().toString();

        // Construct payload simulating what endpoint passes to service
        initialPayload = {
            chatId: `test-chat-id-${uniqueId}`,
            userMessageId: `test-message-id-${uniqueId}`,
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
        EvaluationService.evaluateInteraction.mockResolvedValue({});
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

    it('handles embedding generation errors gracefully (logs and continues)', async () => {
        EmbeddingService.createEmbedding.mockRejectedValueOnce(new Error('Embedding generation failed'));

        // The service should now catch the error and complete successfully
        await expect(InteractionPersistenceService.persistInteraction(initialPayload, user))
            .resolves.toEqual({ success: true });

        expect(ServerLoggingService.error).toHaveBeenCalledWith(
            expect.stringContaining('Embedding creation failed'),
            initialPayload.chatId,
            expect.any(Error)
        );
    });

    it.skip('should persist context.searchQuery to the database', async () => {
        initialPayload.context.searchQuery = 'benefits for seniors';
        initialPayload.context.searchResults = '[{"title":"Benefits"}]';

        await InteractionPersistenceService.persistInteraction(initialPayload, user);

        const interaction = await Interaction.findOne({ interactionId: initialPayload.userMessageId })
            .populate('context');

        expect(interaction.context).toBeTruthy();
        expect(interaction.context.searchQuery).toBe('benefits for seniors');
        expect(interaction.context.searchResults).toBe('[{"title":"Benefits"}]');
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

        expect(interaction).toBeTruthy();
        expect(interaction?.answer?.tools).toHaveLength(0);
        expect(interaction?.answer?.citation?.confidenceRating).toBeFalsy();
    });
});
