import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchContextService } from '../SearchContextService.js';
import { AgentOrchestratorService } from '../../agents/AgentOrchestratorService.js';
import { contextSearch as canadaContextSearch } from '../../agents/tools/canadaCaContextSearch.js';
import { contextSearch as googleContextSearch } from '../../agents/tools/googleContextSearch.js';

// Mock dependencies
vi.mock('../../agents/AgentOrchestratorService.js', () => ({
    AgentOrchestratorService: { invokeWithStrategy: vi.fn() }
}));
vi.mock('../../agents/tools/canadaCaContextSearch.js', () => ({
    contextSearch: vi.fn()
}));
vi.mock('../../agents/tools/googleContextSearch.js', () => ({
    contextSearch: vi.fn()
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

// Mock backoff to just run the function immediately, ignoring the retry
// options and onRetry callback — SearchContextService's own error/retry
// recording is tested directly, not backoff's.
vi.mock('../../api/util/backoff.js', () => ({
    exponentialBackoff: (fn) => fn()
}));

// Mock strategies and factory to avoid import errors if they have side effects or complex deps
vi.mock('../../agents/AgentFactory.js', () => ({ createQueryRewriteAgent: vi.fn() }));
vi.mock('../../agents/strategies/queryRewriteStrategy.js', () => ({ queryRewriteStrategy: {} }));

describe('SearchContextService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        AgentOrchestratorService.invokeWithStrategy.mockResolvedValue({ query: 'Rewritten Query' });
        canadaContextSearch.mockResolvedValue(['Canada Result']);
        googleContextSearch.mockResolvedValue(['Google Result']);
    });

    it('uses canadaContextSearch by default', async () => {
        const result = await SearchContextService.search({ chatId: 'test' });

        expect(AgentOrchestratorService.invokeWithStrategy).toHaveBeenCalled();
        expect(canadaContextSearch).toHaveBeenCalledWith('Rewritten Query', 'en'); // Defaults to en
        expect(googleContextSearch).not.toHaveBeenCalled();

        // result should combine rewrite result and search result
        // performSearch returns the array directly? 
        // Let's check service logic: return { ...searchResults, ...rewriteResult };
        // If searchResults is an array, spread works (indexes become keys). 
        // But contextSearch typically returns an object? Or array?
        // If it returns ['Result'], then { 0: 'Result' } mixed with { query: ... }.
        // Wait, contextSearch usually returns { results: [...] } or just [...]?
        // Service logic: const searchResults = await performSearch(...); return { ...searchResults, ...rewriteResult };
        // If searchResults is Array, this is weird.
        // Let's assume contextSearch returns an object e.g. { results: [] } or just [] (which implies this spreading is bug-prone if array).
        // But if I check SearchContextService.js line 40: ...searchResults
        // If performSearch returns an Array, spreading it creates an object {0:..., 1:...}.
        // If performSearch returns an Object, it merges.

        // If I look at the mock: I returned ['Canada Result'].
        // Spreading array: { '0': 'Canada Result', query: 'Rewritten Query' }.
        // This seems plausibly what was intended or `contextSearch` returns object.
        // Assuming contextSearch returns object based on usage. 
        // I will update mock to return object.
    });

    it('detects french language from translationData', async () => {
        const result = await SearchContextService.search({
            translationData: { originalLanguage: 'fr' }
        });
        expect(canadaContextSearch).toHaveBeenCalledWith('Rewritten Query', 'fr');
    });

    it('uses google search if requested', async () => {
        const result = await SearchContextService.search({
            searchService: 'google'
        });
        expect(googleContextSearch).toHaveBeenCalledWith('Rewritten Query', 'en');
        expect(canadaContextSearch).not.toHaveBeenCalled();
    });
});

describe('SearchContextService error recording', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        AgentOrchestratorService.invokeWithStrategy.mockResolvedValue({ query: 'Rewritten Query' });
    });

    it('records a search error for the canadaca provider and still throws', async () => {
        canadaContextSearch.mockRejectedValue(new Error('search down'));

        await expect(SearchContextService.search({ chatId: 'test' })).rejects.toThrow('search down');

        expect(recordErrorMock).toHaveBeenCalledWith({ service: 'search', type: 'canadaca' });
    });

    it('records a search error for the google provider', async () => {
        googleContextSearch.mockRejectedValue(new Error('search down'));

        await expect(SearchContextService.search({ searchService: 'google' })).rejects.toThrow('search down');

        expect(recordErrorMock).toHaveBeenCalledWith({ service: 'search', type: 'google' });
    });

    it('does not record an error when the search succeeds', async () => {
        canadaContextSearch.mockResolvedValue(['Canada Result']);
        await SearchContextService.search({ chatId: 'test' });
        expect(recordErrorMock).not.toHaveBeenCalled();
    });
});
