import AnalyzerBase from './AnalyzerBase.js';

export class NoOpAnalyzer extends AnalyzerBase {
    static id = 'no-analyzer';
    static inputType = 'universal';
    static outputColumns = ['explanation', 'status', 'label', 'flagged', 'differenceFound', 'differenceExplanation'];

    async analyze(input) {
        const referencePresent = Boolean(input?.referenceAnswer || input?.referenceAnalysisResults);

        return {
            status: 'pass',
            label: 'no-analyzer',
            flagged: false,
            differenceFound: false,
            differenceExplanation: referencePresent ? 'No analyzer comparison was performed.' : '',
            explanation: 'No analysis was requested for this item.'
        };
    }
}

export default NoOpAnalyzer;
