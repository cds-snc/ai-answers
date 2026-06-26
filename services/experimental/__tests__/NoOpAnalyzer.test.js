import { describe, it, expect } from 'vitest';
import NoOpAnalyzer from '../analyzers/NoOpAnalyzer.js';

describe('NoOpAnalyzer', () => {
    it('returns a pass without modifying the answer', async () => {
        const analyzer = new NoOpAnalyzer();

        const result = await analyzer.analyze({
            question: 'Q',
            answer: 'A',
            baselineAnswer: 'B'
        });

        expect(result.status).toBe('pass');
        expect(result.label).toBe('no-analyzer');
        expect(result.flagged).toBe(false);
        expect(result.differenceFound).toBe(false);
    });
});
