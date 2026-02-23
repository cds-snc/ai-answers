import { describe, it, expect } from 'vitest';
import AnalyzerBase from '../analyzers/AnalyzerBase.js';

class TestAnalyzer extends AnalyzerBase {
    static id = 'test';
    static inputType = 'single';
}

class TestComparisonAnalyzer extends AnalyzerBase {
    static id = 'test-comp';
    static inputType = 'comparison';
}

describe('AnalyzerBase', () => {
    describe('validateInput', () => {
        it('should validate single input with answer', () => {
            const analyzer = new TestAnalyzer();
            const result = analyzer.validateInput({ answer: 'yes' });
            expect(result.valid).toBe(true);
        });

        it('should validate single input with question', () => {
            const analyzer = new TestAnalyzer();
            const result = analyzer.validateInput({ question: 'what?' });
            expect(result.valid).toBe(true);
        });

        it('should fail single input without answer and question', () => {
            const analyzer = new TestAnalyzer();
            const result = analyzer.validateInput({});
            expect(result.valid).toBe(false);
            expect(result.error).toContain('requires answer or question');
        });

        it('should validate comparison input with both answers', () => {
            const analyzer = new TestComparisonAnalyzer();
            const result = analyzer.validateInput({ baselineAnswer: 'a', comparisonAnswer: 'b' });
            expect(result.valid).toBe(true);
        });

        it('should fail comparison input if baseline is missing', () => {
            const analyzer = new TestComparisonAnalyzer();
            const result = analyzer.validateInput({ comparisonAnswer: 'b' });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('requires baselineAnswer and comparisonAnswer');
        });
    });

    it('should throw if analyze is not implemented', async () => {
        const analyzer = new TestAnalyzer();
        await expect(analyzer.analyze({})).rejects.toThrow('Subclass must implement');
    });
});
