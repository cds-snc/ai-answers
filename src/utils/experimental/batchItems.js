/**
 * Pure helpers shared by the batch results drill-down UI.
 */

// Item-level verdict for display, derived from the standardized item fields
// (ExperimentalBatchService sets `flagged`/`match` from every analyzer's result).
export const getItemVerdict = (item) => {
    if (!item) return 'pending';
    if (item.status === 'failed') return 'error';
    if (item.status !== 'completed') return item.status || 'pending';
    if (item.flagged === true || item.match === false) return 'flagged';
    return 'pass';
};

// Best one-line explanation for the list view: prefer judge explanations,
// fall back to the standardized field or the processing error.
export const getItemExplanation = (item) => {
    if (!item) return '';
    if (item.status === 'failed' && item.error) return item.error;

    const results = item.analysisResults || {};
    for (const result of Object.values(results)) {
        const text = result?.explanation || result?.differenceExplanation;
        if (text) return text;
    }
    return item.explanation || '';
};

export const truncate = (text, max = 120) => {
    const value = String(text || '');
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

// camelCase / snake_case analyzer output field -> readable label.
// Analyzer field names are internal identifiers, not translated copy.
export const humanizeFieldName = (name) => String(name || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
