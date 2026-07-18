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

    it('uses the golden answer for the main verdict and includes previous-run drift context', async () => {
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
        expect(prompt).toContain('Golden Answer: The program provides support and explains eligibility.');
        expect(prompt).toContain('Previous Run Answer:\nThe program provides support.');
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
});
