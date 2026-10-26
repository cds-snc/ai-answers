import { createChatAgent } from '../agents/AgentFactory.js';
import ServerLoggingService from './ServerLoggingService.js';
import ServiceCallMetricsService from './ServiceCallMetricsService.js';
import { ToolTrackingHandler } from '../agents/ToolTrackingHandler.js';
import { buildAnswerSystemPrompt } from '../agents/prompts/systemPrompt.js';
import ConversationIntegrityService from './ConversationIntegrityService.js';

const NUM_RETRIES = 3;
const BASE_DELAY = 1000; // 1 second

const convertInteractionsToMessages = (interactions) => {
    const messages = [];
    // Ensure we handle mixed history types safely
    const reversed = [...interactions].reverse();
    for (let i = reversed.length - 1; i >= 0; i--) {
        const item = reversed[i];
        // TODO(ai-turn-check-sync): this "is this an AI turn" guard is
        // hand-duplicated in 2 other files - ContextAgentService.js and
        // ConversationIntegrityService.js's serializeHistory (search for
        // "isUser" there). All three independently implement the same
        // invariant (originally by the same author, Ryan Hyma, in commits
        // a2c70182 and b585a348 - a2c70182 wrote this file's own copy;
        // b585a348, five weeks later, added the other two after a real
        // conversation-integrity hash-mismatch bug from them being out of
        // sync). Keep this in sync with the other two if you touch it -
        // consider a shared helper only if that becomes a recurring cost.
        // item.sender === 'user' is defense-in-depth, not the primary guard -
        // a user-sender entry should never carry `.interaction` at all
        // (src/components/chat/ChatAppContainer.js), but the one time that
        // contract broke, every historical turn got pushed here twice.
        if (item && item.sender !== 'user' && item.interaction && item.interaction.question && item.interaction.answer) {
            messages.push({ role: 'user', content: item.interaction.question });
            messages.push({ role: 'assistant', content: item.interaction.answer.content });
        }
    }
    return messages;
};


async function invokeAgent({
    provider = 'openai-gpt51',
    message,
    conversationHistory = [],
    lang,
    department,
    departmentUrl,
    searchResults,
    scenarioOverrideText,
    similarQuestions,
    originalMessage,
}, chatId) {
    const systemPrompt = await buildAnswerSystemPrompt(lang || 'en', {
        department,
        departmentUrl,
        searchResults,
        scenarioOverrideText,
        similarQuestions,
    });

    const agent = await createChatAgent(provider, chatId);
    const messages = [
        { role: 'system', content: systemPrompt },
        ...convertInteractionsToMessages(conversationHistory),
        { role: 'user', content: message },
    ];

    ServerLoggingService.info(`${provider} chat invoke start`, chatId);
    //ServerLoggingService.debug(`${provider} chat messages`, chatId, { messages });
    const answer = await agent.invoke({ messages });
    ServerLoggingService.info(`${provider} chat invoke end`, chatId);

    if (Array.isArray(answer.messages) && answer.messages.length > 0) {
        const lastMessage = answer.messages[answer.messages.length - 1];
        let toolTrackingHandler = null;
        for (const cb of agent.callbacks) {
            if (cb instanceof ToolTrackingHandler) {
                toolTrackingHandler = cb;
                break;
            }
        }
        const toolUsage = toolTrackingHandler ? toolTrackingHandler.getToolUsageSummary() : {};
        const response = {
            content: lastMessage.content,
            inputTokens: lastMessage.response_metadata.tokenUsage?.promptTokens,
            outputTokens: lastMessage.response_metadata.tokenUsage?.completionTokens,
            model: lastMessage.response_metadata.model_name,
            tools: toolUsage,
        };

        // Calculate signature for conversation integrity verification
        const finalHistory = [
            ...conversationHistory,
            { sender: 'user', text: originalMessage || message },
            { sender: 'ai', text: lastMessage.content }
        ];
        response.historySignature = ConversationIntegrityService.calculateSignature(finalHistory);

        ServerLoggingService.info(`${provider} chat request completed`, chatId, response);
        return response;
    }
    throw new Error(`${provider} returned no messages`);
}

export const AnswerGenerationService = {
    async generateAnswer(params, chatId) {
        let lastError;
        for (let attempt = 0; attempt < NUM_RETRIES; attempt++) {
            try {
                return await invokeAgent(params, chatId);
            } catch (e) {
                lastError = e;
                ServerLoggingService.error(`Attempt ${attempt + 1} failed:`, chatId, e);
                if (attempt < NUM_RETRIES - 1) {
                    // Fire-and-forget — not awaited, see ServiceCallMetricsService's contract.
                    ServiceCallMetricsService.recordRetry({ service: 'ai', type: 'answer' });
                    const delay = Math.pow(2, attempt) * BASE_DELAY;
                    await new Promise((r) => setTimeout(r, delay));
                }
            }
        }
        ServerLoggingService.error('All retry attempts failed', chatId, lastError);
        ServiceCallMetricsService.recordError({ service: 'ai', type: 'answer' });
        throw new Error(`Failed after retries: ${lastError?.message}`);
    }
};
