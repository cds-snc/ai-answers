
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphWorkflowHelper } from '../GraphWorkflowHelper.js';
import { SearchContextService } from '../../../../services/SearchContextService.js';
import { invokeContextAgent } from '../../../../services/ContextAgentService.js';
import { InteractionPersistenceService } from '../../../../services/InteractionPersistenceService.js';

vi.mock('../../../../services/SearchContextService.js');
vi.mock('../../../../services/ContextAgentService.js');
vi.mock('../../../../services/InteractionPersistenceService.js');
vi.mock('../../../../services/ServerLoggingService.js');

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
    });
});
