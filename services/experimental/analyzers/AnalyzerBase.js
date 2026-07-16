/**
 * Base class for all analyzers (Evaluators and Comparators).
 * Subclasses must implement static properties and the analyze() method.
 */
export class AnalyzerBase {
    static standardOutputColumns = [
        'verdict',
        'label',
        'flagged',
        'differenceFound',
        'explanation'
    ];
    // Required static properties - subclasses must override
    static id = '';           // e.g., 'expert-scorer'
    static nameKey = '';      // e.g., 'experimental.analysis.analyzers.expert-scorer.name'
    static descriptionKey = '';  // e.g., 'experimental.analysis.analyzers.expert-scorer.description'
    static inputType = '';    // 'single' | 'comparison' | 'universal'
    static outputColumns = []; // e.g., ['verdict', 'confidence', 'explanation']

    /**
     * Validate the full set of batch input rows before the batch is created.
     * Override this to enforce analyzer-specific requirements. The service
     * calls this generically — it does not inspect the result's meaning.
     *
     * @param {Object[]} items - Raw input rows from the dataset or upload.
     * @returns {{ valid: true } | { valid: false, code: string, localeKey: string }}
     */
    static validateBatch(_items) {
        return { valid: true };
    }

    constructor(config = {}) {
        this.config = config;
    }

    /**
     * Adds the shared, one-line explanation required on every analyzer result.
     * Analyzer-specific fields remain intact; this makes the list view, detail
     * view, exports, and future analyzers share one stable field to consume.
     */
    normalizeResult(result) {
        if (!result || typeof result !== 'object' || Array.isArray(result)) {
            throw new Error('Analyzer must return a result object.');
        }

        const rawStatus = String(result.status || '').trim().toLowerCase();
        const rawVerdict = String(result.verdict || '').trim().toLowerCase();
        const normalizedVerdict = rawVerdict === 'fail' || rawVerdict === 'error'
            ? 'flagged'
            : rawVerdict;
        const verdict = normalizedVerdict
            || (['pass', 'flagged', 'needs-review'].includes(rawStatus) ? rawStatus : null)
            || (result.flagged === true || result.differenceFound === true ? 'flagged' : 'pass');
        const flagged = result.flagged === true
            || verdict === 'flagged'
            || verdict === 'needs-review'
            || result.differenceFound === true;
        const differenceFound = result.differenceFound === true;
        const explanation = [
            result.explanation,
            result.differenceExplanation,
            result.details
        ].find(value => typeof value === 'string' && value.trim())
            || `Analyzer completed with ${result.label || result.verdict || result.status || 'no verdict'}.`;

        return {
            ...result,
            verdict,
            label: result.label || verdict,
            flagged,
            differenceFound,
            explanation
        };
    }

    /**
     * Analyze input and return structured results.
     * @param {Object} input - { question, answer, referenceAnswer, config, originalData }
     * @returns {Promise<Object>} - Analysis results matching outputColumns
     */
    async analyze(input) {
        throw new Error('Subclass must implement analyze()');
    }
}

export default AnalyzerBase;
