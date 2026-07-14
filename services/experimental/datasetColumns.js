// Shared dataset column-name constants. Kept dependency-free so API
// endpoints can import them without pulling in queue/processing modules.

// Reference answer to compare against (exact column names).
// Also mirrored in ExperimentalAnalysisPage.js (REFERENCE_COLUMN_NAMES) because
// frontend code cannot import from services/.
export const REFERENCE_ANSWER_ALIASES = [
    'referenceAnswer',
    'reference',
    'answer',
    'redactedAnswer',
    'response',
    'newAnswer',
    'comparison',
    'comparisonAnswer',
    'baselineAnswer',
    'baseline',
    'goldenAnswer'
];

export const normalizeDatasetColumnName = (name = '') => String(name)
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .trim();

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
    const explicitAliases = REFERENCE_ANSWER_ALIASES
        .filter(alias => !['answer', 'redactedAnswer'].includes(alias))
        .map(normalizeDatasetColumnName);
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
