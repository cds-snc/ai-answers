import { describe, it, expect } from 'vitest';
import { analyzerClasses } from '../index.js';
import { ExpertScorerAnalyzer } from '../ExpertScorerAnalyzer.js';
import { RefusalAnalyzer } from '../RefusalAnalyzer.js';
import { SimilarAnswerAnalyzer } from '../SimilarAnswerAnalyzer.js';
import { BiasEvaluator } from '../BiasEvaluator.js';
import { SafetyEvaluator } from '../SafetyEvaluator.js';
import { NoOpAnalyzer } from '../NoOpAnalyzer.js';

describe('Analyzer contracts', () => {
    it('should register all analyzers with unique IDs', () => {
        const ids = analyzerClasses.map((c) => c.id);
        expect(ids).toHaveLength(new Set(ids).size);
    });

    it('should have valid inputType for all analyzers', () => {
        const validTypes = ['single', 'comparison', 'universal'];
        for (const AnalyzerClass of analyzerClasses) {
            expect(validTypes).toContain(AnalyzerClass.inputType);
        }
    });

    it('should use inputType "comparison" for expert-scorer', () => {
        expect(ExpertScorerAnalyzer.inputType).toBe('comparison');

        // validateBatch accepts standalone question+answer rows as well as
        // rows that include a comparison answer.
        expect(ExpertScorerAnalyzer.validateBatch([{ question: 'Q1' }])).toEqual({ valid: true });
        expect(ExpertScorerAnalyzer.validateBatch([{ question: 'Q1', GoldenAnswer: 'A' }])).toEqual({ valid: true });
        expect(ExpertScorerAnalyzer.validateBatch([{ question: 'Q1', baselineAnswer: 'A' }])).toEqual({ valid: true });

        // All other analyzers are universal — they handle missing baseline gracefully.
        expect(RefusalAnalyzer.inputType).toBe('universal');
        expect(SimilarAnswerAnalyzer.inputType).toBe('universal');
        expect(BiasEvaluator.inputType).toBe('universal');
        expect(SafetyEvaluator.inputType).toBe('universal');
        expect(NoOpAnalyzer.inputType).toBe('universal');
    });

    it('should have non-empty outputColumns for all analyzers', () => {
        for (const AnalyzerClass of analyzerClasses) {
            expect(AnalyzerClass.outputColumns.length).toBeGreaterThan(0);
        }
    });
});
