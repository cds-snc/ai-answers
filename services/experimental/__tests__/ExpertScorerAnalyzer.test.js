import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExpertScorerAnalyzer from '../analyzers/ExpertScorerAnalyzer.js';
import { createJudgeLLM } from '../../../agents/AgentFactory.js';

vi.mock('../../../agents/AgentFactory.js', () => ({
    createJudgeLLM: vi.fn()
}));

describe('ExpertScorerAnalyzer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return fail immediately if answer is empty', async () => {
        const analyzer = new ExpertScorerAnalyzer();
        const result = await analyzer.analyze({ question: 'Q', answer: '', baselineAnswer: 'B' });

        expect(result.verdict).toBe('fail');
        expect(result.explanation).toContain('empty');
        expect(createJudgeLLM).not.toHaveBeenCalled();
    });

    it('should return fail for normal->not-gc regression without calling LLM', async () => {
        const analyzer = new ExpertScorerAnalyzer();
        const result = await analyzer.analyze({
            question: 'Q',
            answer: 'This is <not-gc>',
            baselineAnswer: 'Proper answer'
        });

        expect(result.verdict).toBe('fail');
        expect(result.explanation).toContain('regression from normal to not-gc');
        expect(createJudgeLLM).not.toHaveBeenCalled();
    });

    it('should auto-flag needs-review for normal->clarifying-question downgrade', async () => {
        const mockLLM = {
            invoke: vi.fn().mockResolvedValue({ content: '{"verdict": "pass", "explanation": "Looks okay"}' })
        };
        createJudgeLLM.mockResolvedValue(mockLLM);

        const analyzer = new ExpertScorerAnalyzer();
        const result = await analyzer.analyze({
            question: 'Q',
            answer: 'Can you specify? <clarifying-question>',
            baselineAnswer: 'Proper answer'
        });

        expect(result.verdict).toBe('needs-review');
        expect(result.explanation).toContain('Auto-flag');
    });

    it('should return full result from LLM on pass', async () => {
        const mockLLM = {
            invoke: vi.fn().mockResolvedValue({
                content: '{"verdict": "pass", "confidence": 0.95, "explanation": "Perfect match"}'
            })
        };
        createJudgeLLM.mockResolvedValue(mockLLM);

        const analyzer = new ExpertScorerAnalyzer();
        const result = await analyzer.analyze({
            question: 'Q',
            answer: 'A',
            baselineAnswer: 'A'
        });

        expect(result.verdict).toBe('pass');
        expect(result.confidence).toBe(0.95);
    });

    describe('_getAnswerType', () => {
        const analyzer = new ExpertScorerAnalyzer();

        it('identifies not-gc', () => {
            expect(analyzer._getAnswerType('test <not-gc>')).toBe('not-gc');
        });

        it('identifies clarifying-question', () => {
            expect(analyzer._getAnswerType('test <clarifying-question>')).toBe('clarifying-question');
        });

        it('identifies normal', () => {
            expect(analyzer._getAnswerType('hello world')).toBe('normal');
        });

        it('identifies empty', () => {
            expect(analyzer._getAnswerType('')).toBe('empty');
            expect(analyzer._getAnswerType(null)).toBe('empty');
        });
    });
});
