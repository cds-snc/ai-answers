import BiasEvaluator from './BiasEvaluator.js';
import ExpertScorerAnalyzer from './ExpertScorerAnalyzer.js';
import NoOpAnalyzer from './NoOpAnalyzer.js';
import RefusalAnalyzer from './RefusalAnalyzer.js';
import SafetyEvaluator from './SafetyEvaluator.js';

export const analyzerClasses = [
    BiasEvaluator,
    ExpertScorerAnalyzer,
    NoOpAnalyzer,
    RefusalAnalyzer,
    SafetyEvaluator,
];

export default analyzerClasses;
