import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnswerGenerationService } from '../AnswerGenerationService.js';
import { createChatAgent } from '../../agents/AgentFactory.js';
import ServerLoggingService from '../ServerLoggingService.js';

// Mock dependencies
vi.mock('../../agents/AgentFactory.js', () => ({
    createChatAgent: vi.fn(),
}));
vi.mock('../ConversationIntegrityService.js', () => ({
    default: {
        calculateSignature: vi.fn(() => 'mock-signature'),
    },
}));
vi.mock('../ServerLoggingService.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

const mockAgent = {
    callbacks: [],
    invoke: vi.fn(),
};

describe('AnswerGenerationService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createChatAgent.mockResolvedValue(mockAgent);
    });

    it('should generate an answer successfully', async () => {
        const fakeMessage = {
            content: 'Hello world',
            response_metadata: {
                tokenUsage: { promptTokens: 10, completionTokens: 5 },
                model_name: 'gpt-4',
            },
        };
        mockAgent.invoke.mockResolvedValue({ messages: [fakeMessage] });

        const params = {
            provider: 'openai',
            message: 'Hi',
            conversationHistory: [],
            chatId: 'test-chat',
            lang: 'en',
        };

        const result = await AnswerGenerationService.generateAnswer(params, 'test-chat');

        expect(createChatAgent).toHaveBeenCalledWith('openai', 'test-chat');
        expect(mockAgent.invoke).toHaveBeenCalled();
        expect(result).toEqual({
            content: 'Hello world',
            inputTokens: 10,
            outputTokens: 5,
            model: 'gpt-4',
            tools: {},
            historySignature: 'mock-signature',
        });
    });

    it('should handle retry logic on failure', async () => {
        const fakeMessage = {
            content: 'Recovered',
            response_metadata: { tokenUsage: {}, model_name: 'gpt-4' },
        };
        mockAgent.invoke
            .mockRejectedValueOnce(new Error('Fail 1'))
            .mockRejectedValueOnce(new Error('Fail 2'))
            .mockResolvedValue({ messages: [fakeMessage] });

        const params = { message: 'Retry test' };
        const result = await AnswerGenerationService.generateAnswer(params, 'test-chat');

        expect(mockAgent.invoke).toHaveBeenCalledTimes(3);
        expect(result.content).toBe('Recovered');
    });

    it('should throw after max retries', async () => {
        mockAgent.invoke.mockRejectedValue(new Error('Persistent Error'));

        const params = { message: 'Fail test' };
        await expect(AnswerGenerationService.generateAnswer(params, 'test-chat'))
            .rejects.toThrow('Failed after retries: Persistent Error');

        expect(mockAgent.invoke).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed conversation history types robustly', async () => {
        const fakeMessage = {
            content: 'Response',
            response_metadata: { tokenUsage: {}, model_name: 'gpt-4' },
        };
        mockAgent.invoke.mockResolvedValue({ messages: [fakeMessage] });

        // Mixed history: One valid interaction, one raw user message (should be skipped by logic)
        const mixedHistory = [
            { sender: 'user', text: 'Ignored raw message' },
            {
                interaction: {
                    question: 'Valid Question',
                    answer: { content: 'Valid Answer' }
                }
            }
        ];

        const params = {
            message: 'Current',
            conversationHistory: mixedHistory,
        };

        await AnswerGenerationService.generateAnswer(params, 'test-chat');

        const invokeCall = mockAgent.invoke.mock.calls[0][0];
        const messages = invokeCall.messages;

        // Expected: System prompt, Valid Q, Valid A, Current User Msg
        // Raw 'Ignored raw message' should NOT be present because it lacks 'interaction'
        const userContent = messages.map(m => m.content);
        expect(userContent).toContain('Valid Question');
        expect(userContent).toContain('Valid Answer');
        expect(userContent).toContain('Current');
        expect(userContent).not.toContain('Ignored raw message');
    });
});
