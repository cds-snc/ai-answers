
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphWorkflowHelper } from '../GraphWorkflowHelper.js';
import { SearchContextService } from '../../../../services/SearchContextService.js';
import { invokeContextAgent } from '../../../../services/ContextAgentService.js';
import { InteractionPersistenceService } from '../../../../services/InteractionPersistenceService.js';
import { AnswerGenerationService } from '../../../../services/AnswerGenerationService.js';
import ServiceCallMetricsService from '../../../../services/ServiceCallMetricsService.js';

vi.mock('../../../../services/SearchContextService.js');
vi.mock('../../../../services/ContextAgentService.js');
vi.mock('../../../../services/InteractionPersistenceService.js');
vi.mock('../../../../services/AnswerGenerationService.js');
vi.mock('../../../../services/ServerLoggingService.js');
vi.mock('../../../../services/ServiceCallMetricsService.js');

// Deterministic, delay-free stand-in for the real exponentialBackoff (which is
// covered on its own in api/util/__tests__/backoff.test.js): runs fn() once,
// and on failure calls onRetry (simulating "a retry would have happened")
// before rethrowing, so deriveContext's own catch block can be tested without
// waiting on real backoff delays.
vi.mock('../../../../api/util/backoff.js', () => ({
    exponentialBackoff: async (fn, retries, baseDelay, onRetry) => {
        try {
            return await fn();
        } catch (error) {
            if (onRetry) onRetry(error, retries);
            throw error;
        }
    },
}));

// The search tools pull in gaxios, which fails to load under vitest (it require()s the
// ESM-only uuid package). Stub them with factories so the real modules are never imported.
vi.mock('../../../tools/googleContextSearch.js', () => ({ contextSearch: vi.fn() }));
vi.mock('../../../tools/canadaCaContextSearch.js', () => ({ contextSearch: vi.fn() }));

describe('GraphWorkflowHelper', () => {
    let helper;

    beforeEach(() => {
        vi.clearAllMocks();
        helper = new GraphWorkflowHelper();
    });

    describe('deriveContext', () => {
        it('should include searchQuery in the returned context', async () => {
            const mockSearchResult = {
                results: 'some results',
                provider: 'google',
                query: 'test query',
                systemPrompt: 'system prompt',
            };

            SearchContextService.search.mockResolvedValue(mockSearchResult);

            invokeContextAgent.mockResolvedValue({
                message: '<department>EDSC-ESDC</department>',
                model: 'gpt-4',
                inputTokens: 10,
                outputTokens: 10,
            });

            const context = await helper.deriveContext({
                selectedAI: 'openai',
                translationData: {},
                lang: 'en',
                department: 'dept',
                referringUrl: 'url',
                searchProvider: 'google',
                conversationHistory: [],
                chatId: 'test-chat-id',
                userMessage: 'test question',
            });

            expect(context).toHaveProperty('searchQuery', 'test query');
        });

        it('should forward referringUrl to the context agent', async () => {
            SearchContextService.search.mockResolvedValue({
                results: 'some results',
                query: 'test query',
            });

            invokeContextAgent.mockResolvedValue({
                message: '<department>PrairiesCan</department>',
                model: 'gpt-4',
                inputTokens: 10,
                outputTokens: 10,
            });

            const referringUrl =
                'https://test.canada.ca/experimental/en/aia/prairies-economic-development.html';

            await helper.deriveContext({
                selectedAI: 'openai',
                translationData: {},
                lang: 'en',
                department: 'dept',
                referringUrl,
                searchProvider: 'google',
                conversationHistory: [],
                chatId: 'test-chat-id',
                userMessage: 'test question',
            });

            expect(invokeContextAgent).toHaveBeenCalledWith(
                'openai',
                expect.objectContaining({ referringUrl })
            );
        });

        it('records an AI context-call error and rethrows when invokeContextAgent fails', async () => {
            SearchContextService.search.mockResolvedValue({ results: 'some results', query: 'test query' });
            const err = new Error('context agent down');
            invokeContextAgent.mockRejectedValue(err);

            await expect(helper.deriveContext({
                selectedAI: 'openai',
                translationData: {},
                lang: 'en',
                department: 'dept',
                referringUrl: 'url',
                searchProvider: 'google',
                conversationHistory: [],
                chatId: 'test-chat-id',
                userMessage: 'test question',
            })).rejects.toThrow('context agent down');

            expect(ServiceCallMetricsService.recordError).toHaveBeenCalledWith({ service: 'ai', type: 'context' });
            expect(ServiceCallMetricsService.recordRetry).toHaveBeenCalledWith({ service: 'ai', type: 'context' });
        });
    });

    // The answer agent's prompts (agenticBase.js, safety.js, citationInstructions.js) all
    // reference tags that only this method injects. Nothing throws if one goes missing, so
    // these assertions are the only thing standing between a refactor and a silent
    // regression. See "Never drop a prompt tag that code has to inject" in AGENTS.md.
    describe('sendAnswerRequest', () => {
        const sendWith = (overrides = {}) => {
            AnswerGenerationService.generateAnswer.mockResolvedValue({ content: 'an answer' });
            return helper.sendAnswerRequest({
                selectedAI: 'openai',
                conversationHistory: [],
                lang: 'en',
                context: { translatedQuestion: 'How do I apply?', outputLang: 'eng' },
                chatId: 'test-chat-id',
                ...overrides,
            });
        };

        const sentMessage = () => AnswerGenerationService.generateAnswer.mock.calls[0][0].message;

        it('appends a <referring-url> tag to the outgoing message', async () => {
            const referringUrl = 'https://www.canada.ca/en/services/benefits.html';

            await sendWith({ referringUrl });

            expect(sentMessage()).toContain(`<referring-url>${referringUrl}</referring-url>`);
        });

        it('trims surrounding whitespace from the referring URL', async () => {
            await sendWith({ referringUrl: '  https://www.canada.ca/en.html\n' });

            expect(sentMessage()).toContain(
                '<referring-url>https://www.canada.ca/en.html</referring-url>'
            );
        });

        it.each([
            ['undefined', undefined],
            ['an empty string', ''],
            ['whitespace only', '   '],
        ])('emits no <referring-url> tag when the URL is %s', async (_label, referringUrl) => {
            await sendWith({ referringUrl });

            expect(sentMessage()).not.toContain('<referring-url>');
        });

        it('always sends an <output-lang> tag', async () => {
            await sendWith({ referringUrl: 'https://www.canada.ca/en.html' });

            expect(sentMessage()).toContain('<output-lang>eng</output-lang>');
        });

        it('sends <final-turn> once the user reaches the last allowed turn', async () => {
            // maxTurns is 3, and currentTurn counts this question on top of the history
            await sendWith({ conversationHistory: [{}, {}] });

            expect(sentMessage()).toContain('<final-turn>true</final-turn>');
        });

        it('does not send <final-turn> on earlier turns', async () => {
            await sendWith({ conversationHistory: [] });

            expect(sentMessage()).not.toContain('<final-turn>');
        });
    });
});
