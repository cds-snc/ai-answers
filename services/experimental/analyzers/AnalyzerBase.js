/**
 * Base class for all analyzers (Evaluators and Comparators).
 * Subclasses must implement static properties and the analyze() method.
 */
export class AnalyzerBase {
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
     * Analyze input and return structured results.
     * @param {Object} input - { question, answer, referenceAnswer, config, originalData }
     * @returns {Promise<Object>} - Analysis results matching outputColumns
     */
    async analyze(input) {
        throw new Error('Subclass must implement analyze()');
    }
}

export default AnalyzerBase;
