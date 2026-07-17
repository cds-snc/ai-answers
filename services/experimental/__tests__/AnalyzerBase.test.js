import { describe, it, expect } from 'vitest';
import AnalyzerBase from '../analyzers/AnalyzerBase.js';

class TestAnalyzer extends AnalyzerBase {
    static id = 'test';
    static inputType = 'single';
}

describe('AnalyzerBase', () => {
    it('should throw if analyze is not implemented', async () => {
        const analyzer = new TestAnalyzer();
        await expect(analyzer.analyze({})).rejects.toThrow('Subclass must implement');
    });

    it('should return valid from default validateBatch', () => {
        expect(AnalyzerBase.validateBatch([{ question: 'Q1' }])).toEqual({ valid: true });
    });

    it('should allow subclasses to override validateBatch', () => {
        class StrictAnalyzer extends AnalyzerBase {
            static id = 'strict';
            static inputType = 'comparison';
            static validateBatch(items) {
                return items.some((i) => i.referenceAnswer)
                    ? { valid: true }
                    : { valid: false, code: 'NO_REFERENCE', localeKey: 'some.key' };
            }
        }
        expect(StrictAnalyzer.validateBatch([{ question: 'Q' }])).toMatchObject({ valid: false });
        expect(StrictAnalyzer.validateBatch([{ question: 'Q', referenceAnswer: 'A' }])).toEqual({ valid: true });
    });
});

