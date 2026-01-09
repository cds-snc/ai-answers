// __tests__/api.chat-message.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../api/chat/chat-message.js';
import { createChatAgent } from '../agents/AgentFactory.js';
import ServerLoggingService from '../services/ServerLoggingService.js';

vi.mock('../agents/AgentFactory.js', () => ({
    createChatAgent: vi.fn(),
}));
vi.mock('../services/ServerLoggingService.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
    }
}));

// Mock the security middleware to stay out of the way of unit tests
vi.mock('../middleware/chat-session.js', () => ({
    withSession: vi.fn((handler) => async (req, res) => {
        req.chatId = req.body?.chatId || 'test-chat';
        return handler(req, res);
    }),
}));
vi.mock('../middleware/auth.js', () => ({
    withOptionalUser: vi.fn((handler) => handler),
}));

const mockAgent = {
    callbacks: [],
    invoke: vi.fn(),
};

beforeEach(() => {
    vi.clearAllMocks();
    createChatAgent.mockResolvedValue(mockAgent);
});

describe('api/chat/chat-message handler', () => {
    it('returns a proper response for a successful chat', async () => {
        const fakeMessage = {
            content: 'Hello world',
            response_metadata: {
                tokenUsage: { promptTokens: 10, completionTokens: 5 },
                model_name: 'gpt-4',
            },
        };
        mockAgent.invoke.mockResolvedValue({ messages: [fakeMessage] });

        const req = {
            method: 'POST',
            body: {
                provider: 'openai',
                message: 'Hi',
                conversationHistory: [],
                chatId: 'test-chat',
                lang: 'en',
                department: '',
                topic: '',
                topicUrl: '',
                departmentUrl: '',
                searchResults: [],
                scenarioOverrideText: '',
            },
        };
        const res = {
            json: vi.fn(() => res),
            status: vi.fn(() => res),
        };

        await handler(req, res);

        expect(createChatAgent).toHaveBeenCalledWith('openai', 'test-chat');
        expect(mockAgent.invoke).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            content: 'Hello world',
            inputTokens: 10,
            outputTokens: 5,
            model: 'gpt-4',
            tools: {},
            historySignature: expect.any(String),
        });
    });

    it('returns 405 for non‑POST methods', async () => {
        const req = { method: 'GET' };
        const res = {
            setHeader: vi.fn(),
            status: vi.fn(() => res),
            end: vi.fn(),
        };
        await handler(req, res);
        expect(res.setHeader).toHaveBeenCalledWith('Allow', ['POST']);
        expect(res.status).toHaveBeenCalledWith(405);
        expect(res.end).toHaveBeenCalled();
    });
});
