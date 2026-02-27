/**
 * Base class for all analyzers (Evaluators and Comparators).
 * Subclasses must implement static properties and the analyze() method.
 */
export class AnalyzerBase {
    // Required static properties - subclasses must override
    static id = '';           // e.g., 'expert-scorer'
    static name = '';         // e.g., 'Expert Scorer'
    static description = '';  // Human-readable description
    static inputType = '';    // 'single' | 'comparison' | 'universal'
    static outputColumns = []; // e.g., ['verdict', 'confidence', 'explanation']

    constructor(config = {}) {
        this.config = config;
    }

    /**
     * Analyze input and return structured results.
     * @param {Object} input - { question, answer, baselineAnswer, comparisonAnswer, config, originalData }
     * @returns {Promise<Object>} - Analysis results matching outputColumns
     */
    async analyze(input) {
        throw new Error('Subclass must implement analyze()');
    }

    /**
     * Validate input before processing.
     * @param {Object} input
     * @returns {{ valid: boolean, error?: string }}
     */
    validateInput(input) {
        if (this.constructor.inputType === 'comparison') {
            if (!input.baselineAnswer || !input.comparisonAnswer) {
                return { valid: false, error: 'Comparison requires baselineAnswer and comparisonAnswer' };
            }
        } else if (this.constructor.inputType === 'single') {
            if (!input.answer && !input.question) {
                return { valid: false, error: 'Single input requires answer or question' };
            }
        } else if (this.constructor.inputType === 'universal') {
            // Universal analyzers handle both with/without baseline gracefully
            if (!input.answer && !input.question) {
                return { valid: false, error: 'Universal input requires answer or question' };
            }
        }
        return { valid: true };
    }
}

export default AnalyzerBase;
