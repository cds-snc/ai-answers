import BiasEvaluator from './BiasEvaluator.js';
import ExpertScorerAnalyzer from './ExpertScorerAnalyzer.js';
import NoOpAnalyzer from './NoOpAnalyzer.js';
import RefusalAnalyzer from './RefusalAnalyzer.js';
import SafetyEvaluator from './SafetyEvaluator.js';
import SimilarAnswerAnalyzer from './SimilarAnswerAnalyzer.js';

export const analyzerClasses = [
    BiasEvaluator,
    ExpertScorerAnalyzer,
    NoOpAnalyzer,
    RefusalAnalyzer,
    SafetyEvaluator,
    SimilarAnswerAnalyzer,
];

export default analyzerClasses;
