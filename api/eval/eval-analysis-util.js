// Shared helpers for the eval-analysis endpoints.

// Whitelist of dashboard filter keys accepted by the analysis pipeline —
// the same contract FilterPanel sends to the metrics endpoints.
const FILTER_KEYS = ['startDate', 'endDate', 'department', 'userType', 'answerType', 'partnerEval', 'aiEval', 'urlEn', 'urlFr', 'referringUrl'];

export function pickFilters(source = {}) {
    const filters = {};
    for (const key of FILTER_KEYS) {
        const value = source[key];
        if (typeof value === 'string' && value !== '') filters[key] = value;
    }
    return filters;
}

// Maps EvalAnalysisService error codes to HTTP responses; rethrows anything
// unrecognized so the endpoint's catch block returns a 500.
export function sendServiceError(res, err) {
    if (err?.code === 'departmentRequired' || err?.code === 'tooFew' || err?.code === 'tooMany') {
        return res.status(400).json({ message: err.message, code: err.code, count: err.count });
    }
    if (err?.code === 'notFound') {
        return res.status(404).json({ message: err.message, code: err.code });
    }
    throw err;
}
