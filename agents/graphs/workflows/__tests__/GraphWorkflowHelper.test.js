
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphWorkflowHelper } from '../GraphWorkflowHelper.js';
import { SearchContextService } from '../../../../services/SearchContextService.js';
import { invokeContextAgent } from '../../../../services/ContextAgentService.js';
import { InteractionPersistenceService } from '../../../../services/InteractionPersistenceService.js';

vi.mock('../../../../services/SearchContextService.js');
vi.mock('../../../../services/ContextAgentService.js');
vi.mock('../../../../services/InteractionPersistenceService.js');
vi.mock('../../../../services/ServerLoggingService.js');

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
                message: '<topic>test topic</topic>',
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
    });
});
