import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchContextService } from '../../../services/SearchContextService.js';
import { AnswerGenerationService } from '../../../services/AnswerGenerationService.js';
import { SimilarAnswerService } from '../../../services/SimilarAnswerService.js';
import { InteractionPersistenceService } from '../../../services/InteractionPersistenceService.js';
import { UrlValidationService } from '../../../services/UrlValidationService.js';
import { graphRequestContext } from '../requestContext.js';

vi.mock('../../../services/ServerLoggingService.js', () => ({
    default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));
vi.mock('../../../services/SearchContextService.js', () => ({
    SearchContextService: { search: vi.fn() }
}));
vi.mock('../../../services/AnswerGenerationService.js', () => ({
    AnswerGenerationService: { generateAnswer: vi.fn(), convertInteractionsToMessages: vi.fn() }
}));
vi.mock('../../../services/SimilarAnswerService.js', () => ({
    SimilarAnswerService: { findSimilarAnswer: vi.fn() }
}));
vi.mock('../../../services/InteractionPersistenceService.js', () => ({
    InteractionPersistenceService: { persistInteraction: vi.fn() }
}));
vi.mock('../../../services/UrlValidationService.js', () => ({
    UrlValidationService: { validateUrl: vi.fn(), validateUrlFormatting: vi.fn() }
}));

vi.mock('../GraphEventLogger.js', () => ({
    logGraphEvent: vi.fn().mockResolvedValue()
}));


// Mock helper internal services
vi.mock('../services/contextService.js', () => ({
    parseContextMessage: vi.fn().mockReturnValue({ formatted: 'context', systemPrompt: 'sys', query: 'q' })
}));
vi.mock('../services/answerService.js', () => ({
    parseResponse: vi.fn().mockReturnValue({ answerType: 'normal', citationUrl: 'http://foo.com' }),
    parseSentences: vi.fn().mockReturnValue(['Sentence 1'])
}));
vi.mock('../guardrails/index.js', () => ({
    RedactionError: class RedactionError extends Error {
        constructor(message, redactedText, redactedItems, blockType = null) {
            super(message);
            this.name = 'RedactionError';
            this.redactedText = redactedText;
            this.redactedItems = redactedItems;
            this.blockType = blockType;
        }
    },
    ShortQueryValidation: class ShortQueryValidation extends Error { },
    runInitialPiiGuardrail: vi.fn(),
    runPostTranslationGuardrail: vi.fn(),
    runRedactionGuardrail: vi.fn((userMessage) => ({ redactedText: userMessage, redactedItems: [] })),
    translateWithGuardrail: vi.fn((text) => ({ translatedText: text, originalLanguage: 'en' })),
    validateShortQueryOrThrow: vi.fn(),
}));
vi.mock('../services/piiService.js', () => ({
    checkPII: vi.fn().mockResolvedValue({ blocked: false, pii: null })
}));
vi.mock('../services/redactionService.js', () => ({
    redactionService: {
        ensureInitialized: vi.fn(),
        redactText: vi.fn((text) => ({ redactedText: text, redactedItems: [] }))
    }
}));
vi.mock('../services/translationService.js', () => ({
    translateQuestion: vi.fn().mockImplementation(({ text }) => ({ translatedText: text, originalLanguage: 'en' }))
}));
vi.mock('../../../services/ContextAgentService.js', () => ({
    invokeContextAgent: vi.fn().mockResolvedValue({ message: 'context msg', model: 'gpt' })
}));
vi.mock('../../../api/util/backoff.js', () => ({
    exponentialBackoff: vi.fn((fn) => fn())
}));
vi.mock('../../../services/ScenarioOverrideService.js', () => ({
    ScenarioOverrideService: { getActiveOverride: vi.fn().mockResolvedValue(null) }
}));

import { instantAndQAGraphApp } from '../InstantAndQAGraph.js';

describe('InstantAndQAGraph Workflow', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Ensure pii mock returns canonical shape for helpers
        const piiModule = await import('../services/piiService.js');
        if (piiModule && piiModule.checkPII && typeof piiModule.checkPII.mockResolvedValue === 'function') {
            piiModule.checkPII.mockResolvedValue({ blocked: false, pii: null });
        }
        const ctxAgent = await import('../../../services/ContextAgentService.js');
        if (ctxAgent && ctxAgent.invokeContextAgent && typeof ctxAgent.invokeContextAgent.mockResolvedValue === 'function') {
            ctxAgent.invokeContextAgent.mockResolvedValue({ message: 'context msg', model: 'gpt' });
        }

        vi.spyOn(graphRequestContext, 'getStore').mockReturnValue({ user: { id: 'test-user' }, headers: {} });

        SearchContextService.search.mockResolvedValue({
            query: 'rewritten',
            results: [{ text: 'context' }]
        });

        AnswerGenerationService.generateAnswer.mockResolvedValue({
            content: 'Generated Answer',
            answerType: 'normal',
            citationUrl: 'https://example.com',
            historySignature: 'sig-123'
        });

        SimilarAnswerService.findSimilarAnswer.mockResolvedValue(null);

        InteractionPersistenceService.persistInteraction.mockResolvedValue({ success: true });

        UrlValidationService.validateUrl.mockResolvedValue({ isValid: true, url: 'https://example.com', confidenceRating: 1 });
        UrlValidationService.validateUrlFormatting.mockResolvedValue({ isValid: true, url: 'https://example.com' });
    });

    // AIA-024: context feeds the system prompt, so it must come from this
    // turn's search and context agent - never from the client-held history.
    it('derives context fresh on a follow-up instead of reusing the history\'s context', async () => {
        const input = {
            chatId: 'chat-1',
            userMessage: 'Follow-up question here',
            userMessageId: 'msg-2',
            conversationHistory: [
                { sender: 'user', text: 'First question' },
                {
                    sender: 'ai',
                    interaction: {
                        question: 'First question',
                        answer: { content: 'First answer', answerType: 'normal' },
                        context: {
                            searchQuery: 'client query',
                            department: 'CLIENT-DEPT',
                            systemPrompt: 'CLIENT SYSTEM PROMPT',
                            similarQuestions: 'CLIENT SIMILAR QUESTIONS',
                            searchResults: 'CLIENT SEARCH RESULTS',
                        },
                    },
                },
            ],
            lang: 'en',
            selectedAI: 'openai',
        };

        const resultState = await instantAndQAGraphApp.invoke(input);

        expect(SearchContextService.search).toHaveBeenCalled();
        expect(resultState.usedExistingContext).toBe(false);
        const answerPayload = AnswerGenerationService.generateAnswer.mock.calls[0][0];
        const promptInputs = JSON.stringify({ ...answerPayload, conversationHistory: undefined });
        expect(promptInputs).not.toContain('CLIENT');
    });
});
