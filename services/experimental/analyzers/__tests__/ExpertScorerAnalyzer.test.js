import { describe, expect, it, vi, beforeEach } from 'vitest';

const invoke = vi.fn();

vi.mock('../../../../agents/AgentFactory.js', () => ({
    createJudgeLLM: vi.fn(async () => ({ invoke }))
}));

import { ExpertScorerAnalyzer } from '../ExpertScorerAnalyzer.js';

describe('ExpertScorerAnalyzer', () => {
    beforeEach(() => {
        invoke.mockReset();
    });

    it('evaluates both runs against the golden answer and includes comparison context', async () => {
        invoke.mockResolvedValue({
            content: JSON.stringify({
                verdict: 'pass',
                confidence: 0.9,
                explanation: 'The current answer matches the canonical reference.',
                driftStatus: 'improved',
                driftExplanation: 'The current answer restores a missing key idea.'
            })
        });

        const result = await new ExpertScorerAnalyzer({ aiProvider: 'azure' }).analyze({
            question: 'What is the program?',
            answer: 'The program provides support and explains eligibility.',
            goldenReferenceAnswer: 'The program provides support and explains eligibility.',
            referenceAnswer: 'The program provides support.',
            originalData: {}
        });

        const prompt = invoke.mock.calls[0][0][0].content;
        expect(prompt).toContain('Reference Answer: The program provides support and explains eligibility.');
        expect(prompt).toContain('Baseline Answer:\nThe program provides support.');
        expect(prompt).toContain('Evaluate BOTH answers against the same Reference Answer above');
        expect(prompt).toContain('"comparisonWinner": "new" | "previous" | "tie" | "needs-review"');
        expect(result.verdict).toBe('pass');
        expect(result.driftStatus).toBe('improved');
    });

    it('retains the existing single-reference behavior without a golden answer', async () => {
        invoke.mockResolvedValue({
            content: JSON.stringify({ verdict: 'pass', confidence: 0.8, explanation: 'Matches.' })
        });

        const result = await new ExpertScorerAnalyzer({ aiProvider: 'azure' }).analyze({
            question: 'What is the program?',
            answer: 'It provides support.',
            referenceAnswer: 'It provides support.',
            originalData: {}
        });

        const prompt = invoke.mock.calls[0][0][0].content;
        expect(prompt).not.toContain('### DRIFT COMPARISON');
        expect(result.driftStatus).toBeUndefined();
    });

    it('uses batch-comparison instructions when run identifiers are present', async () => {
        invoke.mockResolvedValue({
            content: JSON.stringify({
                verdict: 'pass',
                baselineVerdict: 'fail',
                comparisonWinner: 'new'
            })
        });

        await new ExpertScorerAnalyzer({ aiProvider: 'azure' }).analyze({
            question: 'What is the program?',
            answer: 'The program provides support and explains eligibility.',
            referenceAnswer: 'The program provides support.',
            originalData: {
                baselineRunId: 'baseline-run',
                candidateRunId: 'candidate-run'
            }
        });

        const prompt = invoke.mock.calls[0][0][0].content;
        expect(prompt).toContain('### BATCH RUN COMPARISON');
        expect(prompt).toContain('Baseline Answer:');
        expect(prompt).toContain('Compared Against Answer');
    });
});
