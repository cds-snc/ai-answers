import BiasEvaluator from './BiasEvaluator.js';
import ExpertScorerAnalyzer from './ExpertScorerAnalyzer.js';
import SafetyEvaluator from './SafetyEvaluator.js';

export const analyzerClasses = [
    BiasEvaluator,
    ExpertScorerAnalyzer,
    SafetyEvaluator,
];

export default analyzerClasses;
