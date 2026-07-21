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

// Flatten nested analyzer output into displayable column paths. This keeps
// the results UI analyzer-agnostic: objects and arrays from any analyzer are
// exposed as columns such as `debugPayload.vectorMatches.0.similarity`.
export const flattenAnalyzerValue = (value, prefix = '', output = {}) => {
    if (value === null || value === undefined) {
        if (prefix) output[prefix] = value;
        return output;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            if (prefix) output[prefix] = value;
            return output;
        }
        value.forEach((entry, index) => {
            flattenAnalyzerValue(entry, prefix ? `${prefix}.${index}` : String(index), output);
        });
        return output;
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) {
            if (prefix) output[prefix] = value;
            return output;
        }
        entries.forEach(([key, entry]) => {
            flattenAnalyzerValue(entry, prefix ? `${prefix}.${key}` : key, output);
        });
        return output;
    }

    if (prefix) output[prefix] = value;
    return output;
};

// camelCase / snake_case analyzer output field -> readable label.
// Analyzer field names are internal identifiers, not translated copy.
export const humanizeFieldName = (name) => String(name || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
