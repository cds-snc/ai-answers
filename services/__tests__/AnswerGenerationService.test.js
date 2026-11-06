import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnswerGenerationService } from '../AnswerGenerationService.js';
import { createChatAgent } from '../../agents/AgentFactory.js';
import ServerLoggingService from '../ServerLoggingService.js';
import { graphRequestContext } from '../../agents/graphs/requestContext.js';

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
        debug: vi.fn(),
        error: vi.fn(),
    },
}));
const { recordErrorMock, recordRetryMock } = vi.hoisted(() => ({
    recordErrorMock: vi.fn(),
    recordRetryMock: vi.fn(),
}));
vi.mock('../ServiceCallMetricsService.js', () => ({
    default: { recordError: recordErrorMock, recordRetry: recordRetryMock },
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

        expect(createChatAgent).toHaveBeenCalledWith('openai', 'test-chat', { passageTool: false, forcePassages: false, lang: 'en' });
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
        // 2 failed attempts before the successful 3rd => 2 retries recorded, no error
        expect(recordRetryMock).toHaveBeenCalledTimes(2);
        expect(recordRetryMock).toHaveBeenCalledWith({ service: 'ai', type: 'answer' });
        expect(recordErrorMock).not.toHaveBeenCalled();
    });

    it('should throw after max retries', async () => {
        mockAgent.invoke.mockRejectedValue(new Error('Persistent Error'));

        const params = { message: 'Fail test' };
        await expect(AnswerGenerationService.generateAnswer(params, 'test-chat'))
            .rejects.toThrow('Failed after retries: Persistent Error');

        expect(mockAgent.invoke).toHaveBeenCalledTimes(3);
        // 2 retries between the 3 attempts, then a final recorded error
        expect(recordRetryMock).toHaveBeenCalledTimes(2);
        expect(recordErrorMock).toHaveBeenCalledWith({ service: 'ai', type: 'answer' });
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

    // Regression: a user-sender entry should never carry `.interaction` at
    // all (src/components/chat/ChatAppContainer.js gives it a plain
    // questionLanguage string instead) - but the one time that contract was
    // silently broken, the user bubble and its paired AI bubble both carried
    // the same `.interaction` object, and this function had no sender check
    // to fall back on, so every historical turn was pushed twice.
    it('does not double-count a turn when a user-sender entry also carries the same interaction as its paired AI entry', async () => {
        const fakeMessage = {
            content: 'Response',
            response_metadata: { tokenUsage: {}, model_name: 'gpt-4' },
        };
        mockAgent.invoke.mockResolvedValue({ messages: [fakeMessage] });

        const sharedInteraction = {
            question: 'Valid Question',
            answer: { content: 'Valid Answer' },
        };
        const historyWithSharedInteraction = [
            { sender: 'user', text: 'Valid Question', interaction: sharedInteraction },
            { sender: 'ai', interaction: sharedInteraction },
        ];

        await AnswerGenerationService.generateAnswer(
            { message: 'Current', conversationHistory: historyWithSharedInteraction },
            'test-chat'
        );

        const messages = mockAgent.invoke.mock.calls[0][0].messages;
        const questionOccurrences = messages.filter(m => m.content === 'Valid Question').length;
        const answerOccurrences = messages.filter(m => m.content === 'Valid Answer').length;
        expect(questionOccurrences).toBe(1);
        expect(answerOccurrences).toBe(1);
    });

    describe('passage tool gating', () => {
        const fakeMessage = {
            content: 'Answer',
            response_metadata: { tokenUsage: {}, model_name: 'gpt-4' },
        };
        const run = (store, params) => graphRequestContext.run(store, () =>
            AnswerGenerationService.generateAnswer({ provider: 'azure', message: 'Q', lang: 'en', ...params }, 'test-chat'));

        beforeEach(() => {
            mockAgent.invoke.mockResolvedValue({ messages: [fakeMessage] });
        });

        it('offers the tool when the batch turns it on and the question is CRA', async () => {
            await run({ passageTool: true }, { department: 'CRA-ARC' });
            expect(createChatAgent).toHaveBeenCalledWith('azure', 'test-chat', { passageTool: true, forcePassages: false, lang: 'en' });
        });

        it('does not offer the tool for other departments', async () => {
            await run({ passageTool: true }, { department: 'IRCC' });
            expect(createChatAgent).toHaveBeenCalledWith('azure', 'test-chat', { passageTool: false, forcePassages: false, lang: 'en' });
        });

        it('does not offer the tool when the batch flag is off or absent', async () => {
            await run({ passageTool: false }, { department: 'CRA-ARC' });
            await run({ headers: {} }, { department: 'CRA-ARC' });
            await AnswerGenerationService.generateAnswer({ provider: 'azure', message: 'Q', department: 'CRA-ARC' }, 'test-chat');
            for (const call of createChatAgent.mock.calls) {
                expect(call[2].passageTool).toBe(false);
            }
        });

        it('loads the passage tool prompt block only when the tool is offered', async () => {
            const systemPrompt = () => mockAgent.invoke.mock.calls.at(-1)[0].messages[0].content;

            await run({ passageTool: true }, { department: 'CRA-ARC' });
            expect(systemPrompt()).toContain('## PASSAGE TOOL');

            await run({ passageTool: true }, { department: 'IRCC' });
            expect(systemPrompt()).not.toContain('## PASSAGE TOOL');

            await run({ passageTool: false }, { department: 'CRA-ARC' });
            expect(systemPrompt()).not.toContain('## PASSAGE TOOL');
        });

        it('offers the tool for any department when an admin chat turns it on', async () => {
            await run({ passageToolChatMode: 'offered' }, { department: 'IRCC' });
            expect(createChatAgent).toHaveBeenLastCalledWith('azure', 'test-chat', { passageTool: true, forcePassages: false, lang: 'en' });

            await run({ passageToolChatMode: 'offered' }, { department: '' });
            expect(createChatAgent).toHaveBeenLastCalledWith('azure', 'test-chat', { passageTool: true, forcePassages: false, lang: 'en' });
        });

        it('forces passages first only in forced mode', async () => {
            await run({ passageToolChatMode: 'forced' }, { department: 'IRCC' });
            expect(createChatAgent).toHaveBeenLastCalledWith('azure', 'test-chat', { passageTool: true, forcePassages: true, lang: 'en' });
            expect(mockAgent.invoke.mock.calls.at(-1)[0].messages[0].content).toContain('## PASSAGE TOOL');

            await run({ passageTool: true }, { department: 'CRA-ARC' });
            expect(createChatAgent.mock.calls.at(-1)[2].forcePassages).toBe(false);
        });

        it('passes French for French pages', async () => {
            await run({ passageTool: true }, { department: 'CRA-ARC', lang: 'fr' });
            expect(createChatAgent).toHaveBeenCalledWith('azure', 'test-chat', { passageTool: true, forcePassages: false, lang: 'fr' });
        });
    });
});
