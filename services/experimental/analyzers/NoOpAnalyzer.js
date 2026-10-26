import AnalyzerBase from './AnalyzerBase.js';

export class NoOpAnalyzer extends AnalyzerBase {
    static id = 'no-analyzer';
    static inputType = 'universal';
    static supportsBatchComparison = false;
    static outputColumns = ['explanation', 'status', 'label', 'flagged', 'differenceFound', 'comparisonExplanation'];

    async analyze(input) {
        const referencePresent = Boolean(input?.referenceAnswer || input?.referenceAnalysisResults);

        return {
            status: 'pass',
            label: 'no-analyzer',
            flagged: false,
            differenceFound: false,
            explanation: 'No analysis was requested for this item.',
            comparisonExplanation: referencePresent ? 'No analyzer comparison was performed.' : ''
        };
    }
}

export default NoOpAnalyzer;
