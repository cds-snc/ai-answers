import { describe, it, expect, vi, beforeEach } from 'vitest';
import { graphRequestContext } from '../requestContext.js';

const { mockPersistInteraction, mockGetSimilarQuestionsContext } = vi.hoisted(() => ({
    mockPersistInteraction: vi.fn().mockResolvedValue({ success: true }),
    mockGetSimilarQuestionsContext: vi.fn(),
}));

describe('GenericWithQAGraph Workflow', () => {
    let genericWithQAGraphApp;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();

        vi.doMock('../workflows/GraphWorkflowHelper.js', () => ({
            GraphWorkflowHelper: function GraphWorkflowHelper() {
                return {
                validateShortQuery: vi.fn().mockResolvedValue(),
                processRedaction: vi.fn().mockResolvedValue({ redactedText: 'redacted' }),
                translateQuestion: vi.fn().mockResolvedValue({ translatedText: 'translated', originalLanguage: 'en' }),
                postTranslateGuard: vi.fn().mockResolvedValue(),
                deriveContext: vi.fn().mockResolvedValue({ topic: 'topic', department: 'department', searchResults: [] }),
                sendAnswerRequest: vi.fn().mockResolvedValue({ content: 'Generated answer', answerType: 'normal', citationUrl: 'https://example.com' }),
                verifyCitation: vi.fn().mockResolvedValue({ url: 'https://example.com' }),
                persistInteraction: mockPersistInteraction,
                buildTranslationContext: vi.fn().mockReturnValue([]),
                };
            },
        }));
        vi.doMock('../../../services/QuestionAnswerService.js', () => ({
            default: { getSimilarQuestionsContext: mockGetSimilarQuestionsContext },
        }));
        vi.doMock('../GraphEventLogger.js', () => ({ logGraphEvent: vi.fn() }));
        vi.doMock('../../../services/ServerLoggingService.js', () => ({
            default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        }));

        const mod = await import('../GenericWithQAGraph.js');
        genericWithQAGraphApp = mod.genericWithQAGraphApp;
        vi.spyOn(graphRequestContext, 'getStore').mockReturnValue({ user: { userId: 'test-user' } });
    });

    it('persists only threshold-passing Q&A matches', async () => {
        const matchedRecord = {
            chatId: 'used-chat',
            interactionId: 'used-interaction',
            similarity: 0.91,
            questionText: 'Used question',
            answerText: 'Used answer',
            thresholdPassed: true,
        };
        mockGetSimilarQuestionsContext.mockResolvedValue({
            text: 'Q&A context',
            debug: {
                matchedRecords: [matchedRecord],
                preThresholdRecords: [matchedRecord, { chatId: 'unused-chat', thresholdPassed: false }],
            },
        });

        await genericWithQAGraphApp.invoke({
            chatId: 'chat-1', userMessage: 'Question', userMessageId: 'message-1', conversationHistory: [],
            lang: 'en', department: 'department', selectedAI: 'openai',
        });

        expect(mockPersistInteraction).toHaveBeenCalledWith(expect.objectContaining({
            context: expect.objectContaining({
                qaMatches: [expect.objectContaining({
                    chatId: 'used-chat', interactionId: 'used-interaction', similarity: 0.91,
                    questionText: 'Used question', answerText: 'Used answer',
                })],
            }),
        }), undefined);
        expect(mockPersistInteraction.mock.calls[0][0].context.qaMatches).toHaveLength(1);
        expect(mockPersistInteraction.mock.calls[0][0].context.qaMatches[0]).not.toHaveProperty('thresholdPassed');
    });
});
