import { contextSearch as canadaContextSearch } from './canadaCaContextSearch.js';
import { contextSearch as coveoPassageRetrieval } from './coveoPassageRetrieval.js';
import { contextSearch as googleContextSearch } from './googleContextSearch.js';

const SEARCH_PROVIDERS = {
    canadaca: canadaContextSearch,
    'coveo-passage-retrieval': coveoPassageRetrieval,
    google: googleContextSearch,
};

export function getSearchProvider(searchProvider = 'canadaca') {
    if (typeof searchProvider !== 'string') {
        throw new Error('Search provider must be a string.');
    }

    const providerName = searchProvider.toLowerCase();
    if (!Object.hasOwn(SEARCH_PROVIDERS, providerName)) {
        throw new Error(`Unsupported search provider: ${searchProvider}`);
    }

    return SEARCH_PROVIDERS[providerName];
}
