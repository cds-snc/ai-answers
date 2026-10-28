import { tool } from '@langchain/core/tools';
import { retrievePassages } from './canadaCaPassages.js';
import ServerLoggingService from '../../services/ServerLoggingService.js';

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

// Passages from one page overlap heavily (trial 1: the second NOA passage repeated most of
// the first). Drop paragraphs an earlier passage of the same page already gave, and drop a
// passage left empty. Text shared across different pages is kept.
function removeRepeatedText(passages) {
    const seenByUrl = new Map();
    const result = [];
    for (const passage of passages) {
        const seen = seenByUrl.get(passage.url) || new Set();
        const paragraphs = String(passage.text || '').split(/\n\s*\n/);
        const fresh = paragraphs.filter((p) => !p.trim() || !seen.has(p.trim()));
        const trimmed = fresh.length < paragraphs.length;
        if (trimmed && !fresh.some((p) => p.trim())) continue;
        paragraphs.forEach((p) => p.trim() && seen.add(p.trim()));
        seenByUrl.set(passage.url, seen);
        result.push(trimmed
            ? { ...passage, text: `${fresh.join('\n\n').trim()}\n\n(Text repeated from an earlier passage of this page was removed.)` }
            : passage);
    }
    return result;
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

// One log per attempt, so a slow call shows whether it was 429 retries or one slow Coveo
// response (trial 1 had two calls of ~5s and no way to tell). Not awaited, so logging never
// adds to the call's time.
function logAttempt(chatId, attempt, params, result) {
    ServerLoggingService.info('retrievePassages attempt', chatId, {
        attempt,
        mode: params.url ? 'page' : 'open',
        url: params.url ?? null,
        status: result.status ?? null,
        reason: result.reason ?? null,
        latencyMs: result.latencyMs ?? null,
        passages: result.passages?.length ?? 0,
    });
}

async function retrieveWithRetry(params, chatId) {
    let result = await retrievePassages(params);
    logAttempt(chatId, 1, params, result);
    for (const [i, delay] of RETRY_DELAYS_MS.entries()) {
        if (result.status !== 429) break;
        await sleep(delay);
        result = await retrievePassages(params);
        logAttempt(chatId, i + 2, params, result);
    }
    return result;
}

/**
 * Runs one passage request and turns every outcome into text the model can act on.
 * Never throws: a failed call tells the model to fall back to downloadWebPage.
 */
export async function runRetrievePassages({ query, url, lang, chatId = 'system' }) {
    url = url || undefined;
    try {
        const result = await retrieveWithRetry({ query, url, lang: langForUrl(url, lang), maxPassages: MAX_PASSAGES }, chatId);
        if (result.reason === 'invalid_url') {
            return `${url} is not a valid https URL. Use a URL from the search results.`;
        }
        if (!result.ok) {
            return 'Passage retrieval is unavailable right now. Use downloadWebPage instead.';
        }
        if (result.passages.length === 0) {
            return url
                ? `No passages found on ${url} for this query. The page may not be in the passage index. Use downloadWebPage to read it.`
                : 'No passages found for this query. Use downloadWebPage on a page from the search results.';
        }
        return formatPassages(removeRepeatedText(result.passages));
    } catch (error) {
        console.error('retrievePassages tool failed:', error?.message);
        return 'Passage retrieval is unavailable right now. Use downloadWebPage instead.';
    }
}

/**
 * @param {{ lang: 'en'|'fr', chatId?: string }} options - language for open-mode calls, and the
 *   chat the attempt logs belong to
 */
export function createRetrievePassagesTool({ lang, chatId = 'system' }) {
    if (lang !== 'en' && lang !== 'fr') {
        throw new TypeError(`lang must be 'en' or 'fr', got ${lang}`);
    }
    return tool(
        async ({ query, url }) => runRetrievePassages({ query, url, lang, chatId }),
        {
            name: 'retrievePassages',
            description:
                'Get the passages of canada.ca pages that best match a question. With a page URL '
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
                        description: 'Optional. A page URL, to get passages from that page only',
                    },
                },
                required: ['query'],
            },
        },
    );
}
