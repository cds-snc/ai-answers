import dbConnect from '../api/db/db-connect.js';
import mongoose from 'mongoose';
import EmbeddingService from './EmbeddingService.js';
import ServerLoggingService from './ServerLoggingService.js';
import EvaluationService from './EvaluationService.js';
import { Setting } from '../models/setting.js';

export const InteractionPersistenceService = {
    async persistInteraction(arg1, arg2, arg3, arg4) {
        let chatId, interaction, user, options;

        // Support (payload, user, options) signature where payload includes chatId
        if (typeof arg1 === 'object' && arg1 !== null && typeof arg1.chatId === 'string') {
            chatId = arg1.chatId;
            interaction = arg1;
            user = arg2;
            options = arg3 || {};
        } else {
            // Support (chatId, interaction, user, options) signature
            chatId = arg1;
            interaction = arg2;
            user = arg3;
            options = arg4 || {};
        }

        const { forceFallbackEval = false } = options;

        await dbConnect();

        // Resolve mongoose models at runtime to avoid stale model references
        const Chat = mongoose.model('Chat');
        const Interaction = mongoose.model('Interaction');
        const Context = mongoose.model('Context');
        const Question = mongoose.model('Question');
        const Citation = mongoose.model('Citation');
        const Answer = mongoose.model('Answer');
        const Tool = mongoose.model('Tool');
        const Setting = mongoose.model('Setting');

        if (!chatId) {
            throw new Error('chatId_required');
        }

        ServerLoggingService.info('[InteractionPersistenceService] Start - chatId:', chatId);
        let chat = await Chat.findOne({ chatId: chatId });

        if (!chat) {
            chat = new Chat();
        }
        chat.chatId = chatId;
        chat.aiProvider = interaction.selectedAI;
        chat.searchProvider = interaction.searchProvider;
        chat.pageLanguage = interaction.pageLanguage;

        // Assign user to chat if authenticated and not already set
        if (user && user.userId && !chat.user) {
            chat.user = user.userId;
        }

        // Create all MongoDB document objects without saving them yet
        const dbInteraction = new Interaction();
        dbInteraction.interactionId = interaction.userMessageId;
        dbInteraction.responseTime = interaction.responseTime;
        dbInteraction.referringUrl = interaction.referringUrl;
        // Persist optional instant-match identifiers from short-circuit flow
        dbInteraction.instantAnswerChatId = interaction.instantAnswerChatId || '';
        dbInteraction.instantAnswerInteractionId = interaction.instantAnswerInteractionId || '';
        // Persist workflow name when provided by callers
        dbInteraction.workflow = interaction.workflow || '';

        const context = new Context(interaction.context || {});
        // Object.assign(context, interaction.context || {});

        const citation = new Citation();
        citation.aiCitationUrl = interaction.answer?.citationUrl || '';
        citation.providedCitationUrl = interaction.finalCitationUrl || '';
        citation.citationHead = interaction.answer?.citationHead || '';

        const answer = new Answer();
        // populate answer fields defensively
        answer.content = interaction.answer?.content || '';
        answer.englishAnswer = interaction.answer?.englishAnswer || '';
        answer.inputTokens = interaction.answer?.inputTokens || '';
        answer.outputTokens = interaction.answer?.outputTokens || '';
        answer.model = interaction.answer?.model || '';
        answer.answerType = interaction.answer?.answerType || '';
        answer.sentences = interaction.answer?.sentences || [];

        // Link citation after saving citation (below)

        const question = new Question();
        question.redactedQuestion = interaction.question || '';
        question.language = interaction.answer?.questionLanguage || '';
        question.englishQuestion = interaction.answer?.englishQuestion || '';

        // Handle tools data with proper validation
        const toolsData = Array.isArray(interaction.answer?.tools) ? interaction.answer.tools : [];
        const toolObjects = toolsData.map(toolData => new Tool({
            tool: toolData.tool,
            input: toolData.input,
            output: toolData.output,
            startTime: toolData.startTime,
            endTime: toolData.endTime,
            duration: toolData.duration,
            status: toolData.status || 'completed',
            error: toolData.error
        }));

        // Now save everything to MongoDB in a more optimized way
        // 1. Save the tools first
        if (toolObjects.length > 0) {
            const savedTools = await Tool.insertMany(toolObjects);
            answer.tools = savedTools.map(tool => tool._id);
        } else {
            answer.tools = [];
        }

        // 2. Save other entities and ensure we use the saved document IDs
        const savedContext = await context.save();
        const savedCitation = await citation.save();

        // attach citation id to answer then save
        answer.citation = savedCitation._id;
        const savedAnswer = await answer.save();

        const savedQuestion = await question.save();

        // 3. Complete the interaction references and save
        dbInteraction.context = savedContext._id;
        dbInteraction.answer = savedAnswer._id;
        dbInteraction.question = savedQuestion._id;
        await dbInteraction.save();

        // 4. Update and save the chat
        chat.interactions.push(dbInteraction._id);
        await chat.save();

        // 5. Generate embeddings for the interaction (non-blocking for persistence)
        try {
            ServerLoggingService.info('[InteractionPersistenceService] Embedding creation start', chatId);
            await EmbeddingService.createEmbedding(dbInteraction, interaction.selectedAI);
            ServerLoggingService.info('[InteractionPersistenceService] Embedding creation end', chatId);
        } catch (embeddingError) {
            ServerLoggingService.error('[InteractionPersistenceService] Embedding creation failed - continuing persistence', chatId, embeddingError);
        }

        // 6. Perform evaluation on the saved interaction (mode depends on deploymentMode setting)
        let deploymentMode = 'CDS';
        try {
            const setting = await Setting.findOne({ key: 'deploymentMode' });
            if (setting && setting.value) deploymentMode = setting.value;
        } catch (e) {
            ServerLoggingService.error('Failed to read deploymentMode setting', chatId, e);
        }

        ServerLoggingService.info('Evaluation starting', chatId);
        ServerLoggingService.info('Deployment mode', chatId, { deploymentMode });

        if (deploymentMode === 'Vercel') {
            try {
                // Trigger evaluation (provider resolved centrally inside EvaluationService)
                await EvaluationService.evaluateInteraction(dbInteraction, chatId, { forceFallbackEval });
                ServerLoggingService.info('Evaluation completed successfully (Vercel mode)', chat.chatId);
            } catch (evalError) {
                ServerLoggingService.error('Evaluation failed (Vercel mode)', chat.chatId, evalError);
            }
        } else {
            // CDS mode (or default)
            // Trigger background evaluation (provider resolved centrally inside EvaluationService)
            EvaluationService.evaluateInteraction(dbInteraction, chatId, { forceFallbackEval })
                .then(() => {
                    ServerLoggingService.info('Evaluation completed successfully (CDS mode background)', chat.chatId);
                })
                .catch(evalError => {
                    ServerLoggingService.error('Evaluation failed (CDS mode background)', chat.chatId, evalError);
                });
        }

        ServerLoggingService.info('[InteractionPersistenceService] End - chatId:', chatId);
        return { success: true };
    }
};
