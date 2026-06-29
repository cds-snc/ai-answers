import AnalyzerBase from './AnalyzerBase.js';

export class NoOpAnalyzer extends AnalyzerBase {
    static id = 'no-analyzer';
    static inputType = 'universal';
    static outputColumns = ['status', 'label', 'flagged', 'differenceFound', 'differenceExplanation'];

    async analyze(input) {
        const baselinePresent = Boolean(input?.baselineAnswer || input?.baselineAnalysisResults);

        return {
            status: 'pass',
            label: 'no-analyzer',
            flagged: false,
            differenceFound: false,
            differenceExplanation: baselinePresent ? 'No analyzer comparison was performed.' : ''
        };
    }
}

export default NoOpAnalyzer;
