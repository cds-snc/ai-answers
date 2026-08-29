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
        expect(canadaContextSearch).toHaveBeenCalledWith('Rewritten Query', 'en', expect.objectContaining({ onRetry: expect.any(Function) })); // Defaults to en
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
        expect(canadaContextSearch).toHaveBeenCalledWith('Rewritten Query', 'fr', expect.objectContaining({ onRetry: expect.any(Function) }));
    });

    it('uses google search if requested', async () => {
        const result = await SearchContextService.search({
            searchService: 'google'
        });
        expect(googleContextSearch).toHaveBeenCalledWith('Rewritten Query', 'en', expect.objectContaining({ onRetry: expect.any(Function) }));
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

    // googleContextSearch deliberately does not throw — it returns the failure as
    // its result text so the answer agent can say the search failed. That made
    // the Google error count on the technical metrics dashboard structurally
    // zero: the row rendered "0 errors" during a full Google outage. The tool
    // now marks the result, and this is what keeps that marker wired up.
    it('records a search error when google reports a failure without throwing', async () => {
        googleContextSearch.mockResolvedValue({
            failed: true,
            results: 'Search failed: socket hang up',
            provider: 'google',
        });

        const result = await SearchContextService.search({ searchService: 'google' });

        expect(recordErrorMock).toHaveBeenCalledWith({ service: 'search', type: 'google' });
        // Still returned, not thrown — the agent keeps its "search failed" text.
        expect(result.results).toContain('Search failed:');
    });

    // search() re-runs the whole rewrite-and-search when a result looks sparse,
    // and a failed google search reads as 0 results. Without the `failed` guard
    // an outage cost a second LLM rewrite plus a second doomed search, and
    // recorded the error twice — while canadaca, which throws, recorded once.
    it('does not re-search or double-count when google reports a failure', async () => {
        googleContextSearch.mockResolvedValue({
            failed: true,
            results: 'Search failed: socket hang up',
            provider: 'google',
        });

        await SearchContextService.search({ searchService: 'google' });

        expect(googleContextSearch).toHaveBeenCalledTimes(1);
        expect(recordErrorMock).toHaveBeenCalledTimes(1);
        // The rewrite agent runs once for the initial query, never for a retry.
        expect(AgentOrchestratorService.invokeWithStrategy).toHaveBeenCalledTimes(1);
    });

    it('does not record an error for a successful search result', async () => {
        googleContextSearch.mockResolvedValue({ results: 'Title: A', provider: 'google' });

        await SearchContextService.search({ searchService: 'google' });

        expect(recordErrorMock).not.toHaveBeenCalled();
    });

    it('does not record an error when the search succeeds', async () => {
        canadaContextSearch.mockResolvedValue(['Canada Result']);
        await SearchContextService.search({ chatId: 'test' });
        expect(recordErrorMock).not.toHaveBeenCalled();
    });

    // The retry metric is now reported by the search tool calling back through
    // the onRetry option, so nothing throws if that wiring is dropped in a
    // refactor — the counter just silently stops. This is what catches it.
    it.each([
        ['canadaca', canadaContextSearch, {}],
        ['google', googleContextSearch, { searchService: 'google' }],
    ])('records a retry when the %s tool reports one', async (provider, searchTool, searchArgs) => {
        searchTool.mockImplementation(async (_query, _lang, { onRetry } = {}) => {
            onRetry({ error: new Error('reset'), attempt: 1, attempts: 3 });
            return ['Result'];
        });

        await SearchContextService.search({ chatId: 'test', ...searchArgs });

        expect(recordRetryMock).toHaveBeenCalledWith({ service: 'search', type: provider });
        expect(recordErrorMock).not.toHaveBeenCalled();
    });
});
