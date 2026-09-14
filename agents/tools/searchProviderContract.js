export class SearchProviderError extends Error {
    constructor(provider, code, message, { status } = {}) {
        super(message);
        this.name = 'SearchProviderError';
        this.provider = provider;
        this.code = code;
        if (status !== undefined) this.status = status;
    }
}

export function normalizeSearchInput(query, lang = 'en', provider = 'search') {
    if (typeof query !== 'string' || !query.trim()) {
        throw new SearchProviderError(provider, 'SEARCH_PROVIDER_INPUT', 'Search query must be a non-empty string');
    }

    const normalizedLang = typeof lang === 'string' && lang.trim() ? lang.trim() : 'en';
    return { query: query.trim(), lang: normalizedLang };
}

export function normalizeSearchProvider(provider = 'canadaca') {
    if (typeof provider !== 'string' || !['google', 'canadaca'].includes(provider.toLowerCase())) {
        throw new SearchProviderError('search', 'SEARCH_PROVIDER_INPUT', 'Search provider must be google or canadaca');
    }
    return provider.toLowerCase();
}

export function createSearchProviderError(provider, code, message, options = {}) {
    return new SearchProviderError(provider, code, message, options);
}
