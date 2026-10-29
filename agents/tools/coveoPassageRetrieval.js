const PROVIDER = 'coveo-passage-retrieval';
const DEFAULT_SEARCH_HUB = 'canada-gouv-public-websites';
const MAX_PASSAGES = 5;

function getEndpoint(organizationId) {
    if (!/^[a-zA-Z0-9-]+$/.test(organizationId)) {
        throw new Error('COVEO_ORGANIZATION_ID must be a valid Coveo organization ID.');
    }

    return `https://${organizationId}.org.coveo.com/rest/search/v3/passages/retrieve`;
}

function formatPassage(item) {
    if (!item || typeof item.text !== 'string' || !item.document || typeof item.document !== 'object') {
        throw new Error('Coveo Passage Retrieval API returned an invalid passage.');
    }

    const { title, clickableuri: link } = item.document;
    const metadata = [
        typeof title === 'string' ? `Link Text: ${title}` : '',
        typeof link === 'string' ? `Link: ${link}` : '',
    ].filter(Boolean);

    return [`Passage: ${item.text}`, ...metadata].join('\n');
}

export async function contextSearch(query, lang = 'en') {
    if (typeof query !== 'string' || !query.trim()) {
        throw new Error('A non-empty query is required for Coveo Passage Retrieval.');
    }

    const organizationId = process.env.COVEO_ORGANIZATION_ID;
    const apiKey = process.env.COVEO_PASSAGE_RETRIEVAL_API_KEY;
    if (!organizationId || !apiKey) {
        throw new Error(
            'COVEO_ORGANIZATION_ID and COVEO_PASSAGE_RETRIEVAL_API_KEY are required for Coveo Passage Retrieval.'
        );
    }

    const locale = lang.toLowerCase().startsWith('fr') ? 'fr-CA' : 'en-CA';
    const response = await fetch(getEndpoint(organizationId), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            query,
            searchHub: process.env.COVEO_PASSAGE_RETRIEVAL_SEARCH_HUB || DEFAULT_SEARCH_HUB,
            localization: { locale },
            maxPassages: MAX_PASSAGES,
            additionalFields: ['clickableuri'],
        }),
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        throw new Error(`Coveo Passage Retrieval API request failed with status ${response.status}.`);
    }

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.items)) {
        throw new Error('Coveo Passage Retrieval API returned an invalid response.');
    }

    return {
        results: payload.items.length
            ? payload.items.map(formatPassage).join('\n\n')
            : 'No results found.',
        provider: PROVIDER,
        responseId: payload.responseId,
    };
}
