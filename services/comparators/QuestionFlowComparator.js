/**
 * QuestionFlowComparator - Abstract interface for question flow comparison
 * 
 * This defines the contract that all comparators must implement,
 * allowing easy swapping between LLM-based and local model-based comparisons.
 */

/**
 * @typedef {Object} ComparisonResultItem
 * @property {number} index - Index of the candidate in the original array
 * @property {number} score - Normalized similarity/confidence score (0-1)
 * @property {'accept'|'reject'|'uncertain'} recommendation - Whether this candidate matches
 * @property {Object} checks - Granular breakdown of checks performed
 */

/**
 * @typedef {Object} ComparisonResult
 * @property {ComparisonResultItem[]} results - Sorted results (best first)
 * @property {string} method - Identifier for the comparison method used
 * @property {Object} metadata - Additional metadata (model, latency, etc.)
 */

/**
 * Abstract base class for question flow comparison.
 * Implementations should extend this class and implement the compare() method.
 */
export class QuestionFlowComparator {
    /**
     * Compare user questions against candidate question flows
     * @param {string[]} userQuestions - The user's question flow (array of questions)
     * @param {string[]} candidateQuestions - Array of candidate question flows (each is a string)
     * @param {Object} options - Additional options
     * @param {string} [options.chatId] - Chat ID for logging
     * @param {string} [options.selectedAI] - AI provider (for LLM-based comparators)
     * @returns {Promise<ComparisonResult>}
     */
    async compare(userQuestions, candidateQuestions, options = {}) {
        throw new Error('compare() must be implemented by subclass');
    }

    /**
     * Get the name/identifier of this comparator
     * @returns {string}
     */
    getName() {
        return this.constructor.name;
    }
}

export default QuestionFlowComparator;
