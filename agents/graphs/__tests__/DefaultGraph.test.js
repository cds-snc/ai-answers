import { describe, it, expect, vi, beforeEach } from 'vitest';
import { graphRequestContext } from '../requestContext.js';

const { mockDeriveContext } = vi.hoisted(() => ({
    mockDeriveContext: vi.fn().mockResolvedValue({ topic: 't', department: 'd', searchResults: 'results' })
}));

describe('DefaultGraph Workflow', () => {
    let defaultGraphApp;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();

        vi.doMock('../workflows/GraphWorkflowHelper.js', () => ({
            GraphWorkflowHelper: vi.fn().mockImplementation(() => ({
                validateShortQuery: vi.fn().mockResolvedValue(),
                processRedaction: vi.fn().mockResolvedValue({ redactedText: 'redacted' }),
                translateQuestion: vi.fn().mockResolvedValue({ translatedText: 'translated', originalLanguage: 'en' }),
                deriveContext: mockDeriveContext,
                sendAnswerRequest: vi.fn().mockResolvedValue({
                    content: 'Generated Answer',
                    answerType: 'normal',
                    citationUrl: 'https://example.com',
                    historySignature: 'sig-123'
                }),
                verifyCitation: vi.fn().mockResolvedValue({ url: 'https://example.com', confidenceRating: '1' }),
                persistInteraction: vi.fn().mockResolvedValue({ success: true }),
                buildTranslationContext: vi.fn().mockReturnValue([]),
                determineOutputLang: vi.fn().mockReturnValue('eng')
            }))
        }));


        vi.doMock('../GraphEventLogger.js', () => ({
            logGraphEvent: vi.fn().mockResolvedValue()
        }));

        vi.doMock('../../../services/ServerLoggingService.js', () => ({
            default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
        }));

        const mod = await import('../DefaultGraph.js');
        defaultGraphApp = mod.defaultGraphApp;

        vi.spyOn(graphRequestContext, 'getStore').mockReturnValue({ user: { userId: 'test-user' }, headers: {} });
    });

    it('always calls deriveContext even when history exists', async () => {
        const inputWithHistory = {
            chatId: 'chat-1',
            userMessage: 'Follow up question',
            userMessageId: 'msg-2',
            conversationHistory: [
                {
                    sender: 'user',
                    text: 'Previous question'
                },
                {
                    sender: 'ai',
                    text: 'Previous answer',
                    interaction: {
                        context: { searchQuery: 'previous query' },
                        answer: { answerType: 'normal', content: 'Previous answer' }
                    }
                }
            ],
            lang: 'en',
            department: 'dept',
            selectedAI: 'openai'
        };

        const resultState = await defaultGraphApp.invoke(inputWithHistory);

        expect(resultState.status).toBe('complete');
        // Verify that deriveContext was called despite history
        expect(mockDeriveContext).toHaveBeenCalledTimes(1);
    });
});
