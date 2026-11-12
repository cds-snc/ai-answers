// Shared dataset column-name constants. Kept free of queue/processing
// dependencies so API endpoints can import them cheaply.

import { normalizeReferringUrl } from '../../api/util/referring-url.js';

// Reference answer to compare against (exact column names).
// Also mirrored in ExperimentalAnalysisPage.js (REFERENCE_COLUMN_NAMES) because
// frontend code cannot import from services/.
export const REFERENCE_ANSWER_ALIASES = [
    'referenceAnswer',
    'answer',
    'redactedAnswer',
    'response'
];

export const EXPLICIT_REFERENCE_ANSWER_ALIASES = ['referenceAnswer'];

export const REFERRING_URL_ALIASES = ['referringurl', 'url'];

export const normalizeDatasetColumnName = (name = '') => String(name)
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .trim();

// AIA-006: uploaded rows are saved as-is (batch items keep them again inside
// originalData), so normalize every referring-URL column — not just the first
// alias found — before a row reaches the DB.
export const normalizeReferringUrlColumns = (row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const aliases = REFERRING_URL_ALIASES.map(normalizeDatasetColumnName);
    const out = { ...row };
    for (const key of Object.keys(out)) {
        if (aliases.includes(normalizeDatasetColumnName(key))) {
            out[key] = normalizeReferringUrl(out[key]);
        }
    }
    if (out.originalData) out.originalData = normalizeReferringUrlColumns(out.originalData);
    return out;
};

export const hasReferenceAnswerColumn = (columns = []) => {
    const aliases = REFERENCE_ANSWER_ALIASES.map(normalizeDatasetColumnName);
    return (Array.isArray(columns) ? columns : [])
        .some(column => aliases.includes(normalizeDatasetColumnName(column?.name)));
};

export const pickReferenceAnswer = (row = {}) => {
    const aliases = REFERENCE_ANSWER_ALIASES.map(normalizeDatasetColumnName);
    const entries = Object.entries(row || {});

    for (const alias of aliases) {
        const entry = entries.find(([key, value]) =>
            normalizeDatasetColumnName(key) === alias
            && value !== undefined
            && value !== null
            && String(value).trim() !== ''
        );
        if (entry) return entry[1];
    }

    return '';
};

// Explicit reference columns are distinct from answer/redactedAnswer input
// columns. QA-pair preparation uses this to convert an answer-only row into a
// reference while still respecting a separately supplied reference column.
export const pickExplicitReferenceAnswer = (row = {}) => {
    const explicitAliases = EXPLICIT_REFERENCE_ANSWER_ALIASES.map(normalizeDatasetColumnName);
    const entries = Object.entries(row || {});

    for (const alias of explicitAliases) {
        const entry = entries.find(([key, value]) =>
            normalizeDatasetColumnName(key) === alias
            && value !== undefined
            && value !== null
            && String(value).trim() !== ''
        );
        if (entry) return entry[1];
    }

    return '';
};
