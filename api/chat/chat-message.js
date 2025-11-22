// api/chat/chat-message.js
import { createChatAgent } from '../../agents/AgentFactory.js';
import ServerLoggingService from '../../services/ServerLoggingService.js';
import { ToolTrackingHandler } from '../../agents/ToolTrackingHandler.js';
import { withSession } from '../../middleware/session.js';
import { buildAnswerSystemPrompt } from '../../agents/prompts/systemPrompt.js';

const NUM_RETRIES = 3;
const BASE_DELAY = 1000; // 1 second

const convertInteractionsToMessages = (interactions) => {
    const messages = [];
    const reversed = [...interactions].reverse();
    for (let i = reversed.length - 1; i >= 0; i--) {
        messages.push({ role: 'user', content: reversed[i].interaction.question });
        messages.push({ role: 'assistant', content: reversed[i].interaction.answer.content });
    }
    return messages;
};

async function invokeHandler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
    try {
        const {
            provider = 'openai',
            message,
            conversationHistory = [],
            chatId,
            lang,
            department,
            topic,
            topicUrl,
            departmentUrl,
            searchResults,
            scenarioOverrideText,
        } = req.body;

        const systemPrompt = await buildAnswerSystemPrompt(lang || 'en', {
            department,
            departmentUrl,
            topic,
            topicUrl,
            searchResults,
            scenarioOverrideText,
        });

        const agent = await createChatAgent(provider, chatId);
        const messages = [
            { role: 'system', content: systemPrompt },
            ...convertInteractionsToMessages(conversationHistory),
            { role: 'user', content: message },
        ];

        ServerLoggingService.info(`${provider} chat invoke start`, chatId);
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
            ServerLoggingService.info(`${provider} chat request completed`, chatId, response);
            return res.json(response);
        }
        throw new Error(`${provider} returned no messages`);
    } catch (error) {
        const chatId = req.body?.chatId || 'system';
        ServerLoggingService.error(`Error in ${req.body?.provider || 'chat'} handler:`, chatId, error);
        return res.status(500).json({ error: 'Error processing your request', details: error.message });
    }
}

async function handler(req, res) {
    let lastError;
    for (let attempt = 0; attempt < NUM_RETRIES; attempt++) {
        try {
            return await invokeHandler(req, res);
        } catch (e) {
            lastError = e;
            ServerLoggingService.error(`Attempt ${attempt + 1} failed:`, req.body?.chatId || 'system', e);
            if (attempt < NUM_RETRIES - 1) {
                const delay = Math.pow(2, attempt) * BASE_DELAY;
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }
    ServerLoggingService.error('All retry attempts failed', req.body?.chatId || 'system', lastError);
    return res.status(500).json({ error: 'Failed after retries', details: lastError?.message });
}

export default withSession(handler);
