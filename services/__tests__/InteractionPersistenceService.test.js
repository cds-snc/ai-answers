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
    let createdChatIDs = [];
    let createdInteractionIDs = [];
    let createdContextIDs = [];
    let createdQuestionIDs = [];
    let createdCitationIDs = [];
    let createdAnswerIDs = [];
    let createdToolIDs = [];

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
        // Delete in reverse dependency order: tools/citations before answers,
        // answers/contexts/questions before interactions, interactions before chats
        if (createdToolIDs.length)        await Tool.deleteMany({ _id: { $in: createdToolIDs } });
        if (createdCitationIDs.length)    await Citation.deleteMany({ _id: { $in: createdCitationIDs } });
        if (createdAnswerIDs.length)      await Answer.deleteMany({ _id: { $in: createdAnswerIDs } });
        if (createdQuestionIDs.length)    await Question.deleteMany({ _id: { $in: createdQuestionIDs } });
        if (createdContextIDs.length)     await Context.deleteMany({ _id: { $in: createdContextIDs } });
        if (createdInteractionIDs.length) await Interaction.deleteMany({ _id: { $in: createdInteractionIDs } });
        if (createdChatIDs.length)        await Chat.deleteMany({ _id: { $in: createdChatIDs } });
 
        createdToolIDs        = [];
        createdCitationIDs    = [];
        createdAnswerIDs      = [];
        createdQuestionIDs    = [];
        createdContextIDs     = [];
        createdInteractionIDs = [];
        createdChatIDs        = [];
 
        vi.clearAllMocks();
    });
 
    // PersistInteraction creates multiple documents, fetch the full interaction tree
    // and push every created ID into tracking arrays for cleanup
    // Returns the fetched chat and interaction for test assertions
    async function trackCreatedDocuments(chatId, userMessageId) {
        const chat = await Chat.findOne({ chatId });
        if (chat?._id) createdChatIDs.push(chat._id);
 
        const interaction = await Interaction.findOne({ interactionId: userMessageId })
            .populate('context')
            .populate('question')
            .populate({ path: 'answer', populate: ['citation', 'tools'] });
 
        if (interaction?._id)                        createdInteractionIDs.push(interaction._id);
        if (interaction?.context?._id)               createdContextIDs.push(interaction.context._id);
        if (interaction?.question?._id)              createdQuestionIDs.push(interaction.question._id);
        if (interaction?.answer?._id)                createdAnswerIDs.push(interaction.answer._id);
        if (interaction?.answer?.citation?._id)      createdCitationIDs.push(interaction.answer.citation._id);
        if (Array.isArray(interaction?.answer?.tools)) {
            interaction.answer.tools.forEach(t => { if (t._id) createdToolIDs.push(t._id); });
        }
 
        return { chat, interaction };
    }

    it('should successfully persist interaction with embeddings', async () => {
        await InteractionPersistenceService.persistInteraction(initialPayload, user);

        // Fetch persisted chat/interaction documents and track related IDs for cleanup
        const { chat, interaction } = await trackCreatedDocuments(
            initialPayload.chatId,
            initialPayload.userMessageId,
        );

        // Verify chat was created
        expect(chat).toBeTruthy();
        expect(chat.aiProvider).toBe(initialPayload.selectedAI);
        expect(chat.searchProvider).toBe(initialPayload.searchProvider);
        expect(chat.pageLanguage).toBe(initialPayload.pageLanguage);
        // Service might check user
        // (If service logic uses user to set user field on Interaction/Chat, we should check it)

        // Verify interaction
        expect(interaction).toBeTruthy();
        expect(String(interaction.responseTime)).toBe(String(initialPayload.responseTime));
        expect(interaction.referringUrl).toBe(initialPayload.referringUrl);

        // Verify context via the interaction reference to avoid flaky topic-based lookup.
        const contextId = interaction?.context?._id ?? interaction?.context;
        expect(contextId).toBeTruthy();
        const ctx = await Context.findById(contextId);
        expect(ctx).toBeTruthy();
        expect(ctx.topic).toBe(initialPayload.context.topic);

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

        // track the created documents from payload to ensure cleanup and verify that persistence still occurred
        await trackCreatedDocuments(initialPayload.chatId, initialPayload.userMessageId);

        expect(ServerLoggingService.error).toHaveBeenCalledWith(
            expect.stringContaining('Embedding creation failed'),
            initialPayload.chatId,
            expect.any(Error)
        );
    });

    it('should persist context.searchQuery to the database', async () => {
        initialPayload.context.searchQuery = 'benefits for seniors';
        initialPayload.context.searchResults = '[{"title":"Benefits"}]';

        await InteractionPersistenceService.persistInteraction(initialPayload, user);

        const { interaction } = await trackCreatedDocuments(
            initialPayload.chatId,
            initialPayload.userMessageId,
        );

        const contextId = interaction?.context?._id ?? interaction?.context;
        expect(contextId).toBeTruthy();
        const ctx = await Context.findById(contextId);
        expect(ctx).toBeTruthy();
        expect(ctx.searchQuery).toBe('benefits for seniors');
        expect(ctx.searchResults).toBe('[{"title":"Benefits"}]');
    });

    it('should handle missing optional fields', async () => {
        delete initialPayload.answer.tools;
        delete initialPayload.answer.sentences;
        delete initialPayload.confidenceRating;
        delete initialPayload.finalCitationUrl;

        await InteractionPersistenceService.persistInteraction(initialPayload, user);

        const { interaction } = await trackCreatedDocuments(
            initialPayload.chatId,
            initialPayload.userMessageId,
        );

        expect(interaction).toBeTruthy();
        expect(interaction?.answer?.tools).toHaveLength(0);
        expect(interaction?.answer?.citation?.confidenceRating).toBeFalsy();
    });
});
