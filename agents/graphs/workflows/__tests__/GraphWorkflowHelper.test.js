
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphWorkflowHelper } from '../GraphWorkflowHelper.js';
import { SearchContextService } from '../../../../services/SearchContextService.js';
import { invokeContextAgent } from '../../../../services/ContextAgentService.js';
import { InteractionPersistenceService } from '../../../../services/InteractionPersistenceService.js';
import { AnswerGenerationService } from '../../../../services/AnswerGenerationService.js';
import ServiceCallMetricsService from '../../../../services/ServiceCallMetricsService.js';
import { graphRequestContext } from '../../requestContext.js';

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

        it('persists the search cache origin in the context', async () => {
            SearchContextService.search.mockResolvedValue({ results: 'some results', query: 'test query', cacheStatus: 'hit' });
            invokeContextAgent.mockResolvedValue({ message: '', model: 'gpt-4' });

            const context = await helper.deriveContext({
                selectedAI: 'openai', translationData: {}, lang: 'en', department: '',
                referringUrl: '', searchProvider: 'google', conversationHistory: [],
                chatId: 'test-chat-id', userMessage: 'test question',
            });

            expect(context.searchCacheStatus).toBe('hit');
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

        // The client sends its whole messages array: a user message then an AI
        // message per completed turn (ChatAppContainer.js).
        const turnsOfHistory = (n) => Array.from({ length: n }, (_v, i) => [
            { sender: 'user', text: `q${i + 1}` },
            { sender: 'ai', interaction: { answer: { content: `a${i + 1}` } } },
        ]).flat();

        it('sends <final-turn> on the last allowed turn', async () => {
            // turn 3 of 3: two completed turns in the history
            await sendWith({ conversationHistory: turnsOfHistory(2) });

            expect(sentMessage()).toContain('<final-turn>true</final-turn>');
        });

        it.each([
            ['turn 1', 0],
            ['turn 2', 1],
        ])('does not send <final-turn> on %s of 3', async (_label, completedTurns) => {
            await sendWith({ conversationHistory: turnsOfHistory(completedTurns) });

            expect(sentMessage()).not.toContain('<final-turn>');
        });
    });

    // AIA-007: verifyCitation runs the real validator here (not mocked), so
    // this covers the whole gate, including the helper never echoing a
    // rejected citationUrl back as `url`.
    describe('verifyCitation', () => {
        it('keeps a Government of Canada citation', async () => {
            const citationUrl = 'https://inspection.canada.ca/en/animal-health';
            const result = await helper.verifyCitation({ citationUrl, lang: 'en', question: 'q' });
            expect(result).toEqual({ url: citationUrl, fallbackUrl: null });
        });

        it('replaces a non-government citation with the search fallback', async () => {
            const result = await helper.verifyCitation({
                citationUrl: 'https://attacker.example/phish',
                lang: 'en',
                question: 'feed licence',
            });
            expect(result.url).toBeNull();
            expect(result.fallbackUrl).toContain('https://www.canada.ca/en/sr/srb.html?q=feed%20licence');
        });

        it('fails closed to the search fallback when the validator throws', async () => {
            const result = await helper.verifyCitation({
                citationUrl: 'https://attacker.example/phish',
                lang: 'fr',
                question: 'impôts',
                translationF: () => { throw new Error('boom'); },
            });
            expect(result.url).toBeNull();
            expect(result.fallbackUrl).toContain('https://www.canada.ca/fr/sr/srb.html?q=imp%C3%B4ts');
        });
    });

    // A reused answer skips verifyNode, so the stored citation is re-checked
    // when the short-circuit payload is built.
    describe('buildShortCircuitPayload citation', () => {
        const build = (similarShortCircuit) => helper.buildShortCircuitPayload({
            similarShortCircuit,
            startTime: 0,
            endTime: 1,
            userMessage: 'feed licence',
            lang: 'en',
            chatId: 'c1',
        });

        it('keeps a stored Government of Canada citation', () => {
            const url = 'https://inspection.canada.ca/en/animal-health';
            const payload = build({ answer: { content: 'a' }, sourceCitation: { providedCitationUrl: url } });
            expect(payload.finalCitationUrl).toBe(url);
        });

        it('replaces a stored non-government citation with the search fallback', () => {
            const payload = build({ answer: { content: 'a' }, sourceCitation: { providedCitationUrl: 'https://attacker.example/phish' } });
            expect(payload.finalCitationUrl).toContain('https://www.canada.ca/en/sr/srb.html?q=feed%20licence');
        });

        // similarShortCircuit.citationUrl falls back to the raw model aiCitationUrl.
        it('gates the raw aiCitationUrl fallback too', () => {
            const payload = build({ answer: { content: 'a' }, citationUrl: 'https://attacker.example/phish' });
            expect(payload.finalCitationUrl).toContain('https://www.canada.ca/en/sr/srb.html');
        });

        it('leaves no citation when none was stored', () => {
            const payload = build({ answer: { content: 'a' } });
            expect(payload.finalCitationUrl).toBeNull();
        });
    });

    // AIA-006 follow-up: chat-graph-run puts the hostname of a dropped non-GC
    // referrer on the request context; graph state never carries it.
    describe('persistInteraction', () => {
        it('saves the rejected referrer host from the request context', async () => {
            await graphRequestContext.run({ rejectedReferrerHost: 'evil.example' }, () =>
                helper.persistInteraction({ chatId: 'c1', referringUrl: '' }, { userId: 'u' }));

            expect(InteractionPersistenceService.persistInteraction).toHaveBeenCalledWith(
                'c1',
                { chatId: 'c1', referringUrl: '', rejectedReferrerHost: 'evil.example' },
                { userId: 'u' },
            );
        });

        it('saves an empty host outside a chat request (e.g. a batch run)', async () => {
            await helper.persistInteraction({ chatId: 'c1', referringUrl: 'https://example.com/' }, null);

            expect(InteractionPersistenceService.persistInteraction.mock.calls[0][1].rejectedReferrerHost).toBe('');
        });
    });
});
