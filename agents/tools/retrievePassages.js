import { tool } from '@langchain/core/tools';
import { retrievePassages } from './canadaCaPassages.js';

// Phase 2 of docs/plans/coveo-passage-retrieval.md: the answer agent's passage tool.
// AnswerGenerationService offers it only when an experimental batch turns it on and the
// question is matched to CRA. Production traffic never gets it.

// Phase 1 passages ran 2k-15k characters each (one 80k), so 5 open-mode passages could
// cost more tokens than downloading a page. Three keeps the result near one page.
const MAX_PASSAGES = 3;

// Coveo's 5 QPS limit is shared with canada.ca search, and batch items run in parallel.
// The client itself never retries (the test page measures single calls), so retry here.
const RETRY_DELAYS_MS = [1000, 2000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A page-mode call searches in the page's own language, whatever the batch language.
function langForUrl(url, fallback) {
    const match = /^https:\/\/www\.canada\.ca\/(en|fr)\//.exec(url || '');
    return match ? match[1] : fallback;
}

function formatDate(value) {
    if (value === null || value === undefined || value === '') return 'unknown';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}

function formatPassages(passages) {
    return passages.map((passage, i) => [
        `Passage ${i + 1}: ${passage.title}`,
        `URL: ${passage.url}`,
        `Date modified: ${formatDate(passage.dateModified)}`,
        '',
        passage.text,
    ].join('\n')).join('\n\n---\n\n');
}

async function retrieveWithRetry(params) {
    let result = await retrievePassages(params);
    for (const delay of RETRY_DELAYS_MS) {
        if (result.status !== 429) break;
        await sleep(delay);
        result = await retrievePassages(params);
    }
    return result;
}

/**
 * Runs one passage request and turns every outcome into text the model can act on.
 * Never throws: a failed call tells the model to fall back to downloadWebPage.
 */
export async function runRetrievePassages({ query, url, lang }) {
    url = url || undefined;
    try {
        const result = await retrieveWithRetry({ query, url, lang: langForUrl(url, lang), maxPassages: MAX_PASSAGES });
        if (result.reason === 'out_of_scope') {
            return `Passages are only available for canada.ca CRA pages. Use downloadWebPage to read ${url}.`;
        }
        if (!result.ok) {
            return 'Passage retrieval is unavailable right now. Use downloadWebPage instead.';
        }
        if (result.passages.length === 0) {
            return url
                ? `No passages found on ${url} for this query. The page may not be in the passage index. Use downloadWebPage to read it.`
                : 'No passages found for this query. Use downloadWebPage on a page from the search results.';
        }
        return formatPassages(result.passages);
    } catch (error) {
        console.error('retrievePassages tool failed:', error?.message);
        return 'Passage retrieval is unavailable right now. Use downloadWebPage instead.';
    }
}

/**
 * @param {{ lang: 'en'|'fr' }} options - language for open-mode calls
 */
export function createRetrievePassagesTool({ lang }) {
    if (lang !== 'en' && lang !== 'fr') {
        throw new TypeError(`lang must be 'en' or 'fr', got ${lang}`);
    }
    return tool(
        async ({ query, url }) => runRetrievePassages({ query, url, lang }),
        {
            name: 'retrievePassages',
            description:
                'Get the passages of canada.ca pages that best match a question. With a CRA page URL '
                + '(for example from the search results), returns passages from that page only. '
                + 'Without a URL, returns passages from several canada.ca pages. Passages come from a '
                + 'search index that can be a day or more behind the live page.',
            schema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'A focused question in the user\'s words, in the language of the page',
                    },
                    url: {
                        type: 'string',
                        description: 'Optional. A canada.ca CRA page URL, to get passages from that page only',
                    },
                },
                required: ['query'],
            },
        },
    );
}
