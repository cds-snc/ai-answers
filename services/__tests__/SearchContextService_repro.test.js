
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchContextService } from '../SearchContextService.js';
import { AgentOrchestratorService } from '../../agents/AgentOrchestratorService.js';
import { contextSearch as canadaContextSearch } from '../../agents/tools/canadaCaContextSearch.js';
import { contextSearch as googleContextSearch } from '../../agents/tools/googleContextSearch.js';

vi.mock('../../agents/AgentOrchestratorService.js');
vi.mock('../../agents/tools/canadaCaContextSearch.js');
vi.mock('../../agents/tools/googleContextSearch.js');
vi.mock('../ServerLoggingService.js', () => ({
    default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

describe('SearchContextService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return query from rewrite result', async () => {
        AgentOrchestratorService.invokeWithStrategy.mockResolvedValue({
            query: 'rewritten query',
            other: 'meta'
        });

        canadaContextSearch.mockResolvedValue({
            results: 'search results',
            provider: 'canadaca'
        });

        const result = await SearchContextService.search({
            chatId: 'test',
            referringUrl: 'url',
            pageLanguage: 'en'
        });

        expect(result).toHaveProperty('query', 'rewritten query');
        expect(result).toHaveProperty('results', 'search results');
    });
});
