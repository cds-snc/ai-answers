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
    UrlValidationService: { validateUrl: vi.fn() }
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
vi.mock('../services/shortQuery.js', () => ({
    validateShortQueryOrThrow: vi.fn(),
    ShortQueryValidation: class ShortQueryValidation extends Error { }
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
vi.mock('../../../src/utils/backoff.js', () => ({
    exponentialBackoff: vi.fn((fn) => fn())
}));
vi.mock('../../../services/ScenarioOverrideService.js', () => ({
    ScenarioOverrideService: { getActiveOverride: vi.fn().mockResolvedValue(null) }
}));

import { defaultWithVectorGraphApp } from '../DefaultWithVectorGraph.js';

describe('DefaultWithVectorGraph Workflow', () => {
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
            citationUrl: 'https://example.com'
        });

        SimilarAnswerService.findSimilarAnswer.mockResolvedValue(null);

        InteractionPersistenceService.persistInteraction.mockResolvedValue({ success: true });

        UrlValidationService.validateUrl.mockResolvedValue({ isValid: true, url: 'https://example.com', confidenceRating: 1 });
    });

    it('runs full flow (no short circuit)', async () => {
        const input = {
            chatId: 'chat-1',
            userMessage: 'Test Question',
            userMessageId: 'msg-1',
            conversationHistory: [],
            lang: 'en',
            department: 'dept',
            selectedAI: 'openai'
        };

        const resultState = await defaultWithVectorGraphApp.invoke(input);

        // Result might depend on parseResponse mock
        // parseResponse returns { answerType: 'normal', citationUrl: ... }
        // The answerNode returns { answer: { ... } }
        // Verify result structure
        expect(resultState.status).toBe('complete');

        expect(SearchContextService.search).toHaveBeenCalled();
        expect(AnswerGenerationService.generateAnswer).toHaveBeenCalled();
        expect(InteractionPersistenceService.persistInteraction).toHaveBeenCalled();
        const { logGraphEvent } = await import('../GraphEventLogger.js');
        // init node should emit input and output logs
        expect(logGraphEvent).toHaveBeenCalled();
        const calls = logGraphEvent.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);
        expect(calls[0][1]).toBe('node:init input');
        expect(calls[1][1]).toBe('node:init output');
        const callNames = calls.map((c) => c[1]);
        expect(callNames).toContain('node:validate input');
        expect(callNames).toContain('node:validate output');
        expect(callNames).toContain('node:redact input');
        expect(callNames).toContain('node:redact output');
        expect(callNames).toContain('node:translate input');
        expect(callNames).toContain('node:translate output');
        expect(callNames).toContain('node:context input');
        expect(callNames).toContain('node:context output');
    });
});
