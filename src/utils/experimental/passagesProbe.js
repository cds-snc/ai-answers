import { parseBatchCsv, serializeCsvRows } from '../spreadsheets/csv.js';

// Pure helpers for the passage test page's probe run
// (docs/plans/coveo-passage-retrieval.md, Phase 1).

/** Batch input questions are numbered ("01. …"); CPR uses the query as sent, so drop it. */
export function stripBatchNumbering(question) {
    return String(question ?? '').replace(/^\s*\d+\.\s+/, '').trim();
}

/**
 * Reads a batch input export (chatId, createdAt, referringUrl, question, citationUrl,
 * answer). Throws parseBatchCsv's coded errors (EMPTY_CSV, MISSING_QUESTION_COLUMN).
 * @returns {Array<{ question: string, url: string, answer: string }>}
 */
export function parseProbeCsv(text) {
    return parseBatchCsv(text)
        .map((entry) => ({
            question: stripBatchNumbering(entry.REDACTEDQUESTION),
            url: entry.CITATIONURL || '',
            answer: entry.ANSWER || '',
        }))
        .filter((row) => row.question);
}

function sameUrl(a, b) {
    const normalize = (value) => String(value ?? '').trim().replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
    return Boolean(a) && Boolean(b) && normalize(a) === normalize(b);
}

/** Whether any passage came from the row's cited page. */
export function citedPageReturned(passages, citationUrl) {
    return (passages || []).some((passage) => sameUrl(passage.url, citationUrl));
}

/**
 * The calls a probe row makes: page mode when it has a cited URL, then open mode.
 * @returns {Array<'page'|'open'>}
 */
export function probeModesForRow(row) {
    return row.url ? ['page', 'open'] : ['open'];
}

const CSV_HEADERS = [
    'question', 'citationUrl', 'goldenAnswer', 'lang', 'maxPassages', 'mode', 'ok', 'reason', 'detail',
    'status', 'latencyMs', 'passageCount', 'citedPageReturned', 'passages',
];

function formatPassagesForCsv(passages) {
    return (passages || [])
        .map((passage) => `[${passage.score ?? ''}] ${passage.url}\n${passage.text}`)
        .join('\n\n---\n\n');
}

/** Results as CSV text, one line per call. */
export function probeResultsToCsv(results) {
    const rows = results.map((result) => [
        result.question,
        result.citationUrl,
        result.goldenAnswer,
        result.lang,
        result.maxPassages,
        result.mode,
        result.ok ? 'true' : 'false',
        result.reason || '',
        result.detail || '',
        result.status ?? '',
        result.latencyMs ?? '',
        (result.passages || []).length,
        citedPageReturned(result.passages, result.citationUrl) ? 'true' : 'false',
        formatPassagesForCsv(result.passages),
    ]);
    return serializeCsvRows([CSV_HEADERS, ...rows]);
}
