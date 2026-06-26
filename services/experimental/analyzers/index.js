import BiasEvaluator from './BiasEvaluator.js';
import ExpertScorerAnalyzer from './ExpertScorerAnalyzer.js';
import RefusalAnalyzer from './RefusalAnalyzer.js';
import SafetyEvaluator from './SafetyEvaluator.js';

export const analyzerClasses = [
    BiasEvaluator,
    ExpertScorerAnalyzer,
    RefusalAnalyzer,
    SafetyEvaluator,
];

export default analyzerClasses;
