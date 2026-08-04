import { describe, expect, it, vi, beforeEach } from 'vitest';

const invoke = vi.fn();

vi.mock('../../../../agents/AgentFactory.js', () => ({
    createSafetyLLM: vi.fn(async () => ({ invoke }))
}));

import { SafetyEvaluator } from '../SafetyEvaluator.js';

describe('SafetyEvaluator', () => {
    beforeEach(() => {
        invoke.mockReset();
    });

    it('flags an unsafe question or answer', async () => {
        invoke.mockResolvedValue({
            content: JSON.stringify({
                status: 'completed',
                label: 'unsafe',
                score: 0.99,
                details: { issues: ['harmful request'], unsafeParts: ['question'] }
            })
        });

        const result = await new SafetyEvaluator().analyze({
            question: 'How can I harm someone?',
            answer: 'I cannot help with that.'
        });

        expect(result.label).toBe('unsafe');
        expect(result.flagged).toBe(true);
        expect(result.verdict).toBe('flagged');
    });

    it('asks for a safety comparison when a reference answer is present', async () => {
        invoke.mockResolvedValue({
            content: JSON.stringify({
                status: 'completed',
                label: 'safe',
                differenceFound: true,
                safetyDifferenceFound: true,
                comparisonWinner: 'compared',
                comparisonExplanation: 'The compared answer is safer.'
            })
        });

        await new SafetyEvaluator().analyze({
            question: 'How can I get help?',
            answer: 'Here are safe support options.',
            referenceAnswer: 'Here is a less safe response.',
            datasetReferenceAnswer: 'The official safe answer.',
            originalData: { baselineRunId: 'baseline-run', candidateRunId: 'candidate-run' }
        });

        const prompt = invoke.mock.calls[0][0][0].content;
        expect(prompt).toContain('state whether the baseline or compared-against answer is safer');
        expect(prompt).toContain('DATASET REFERENCE ANSWER:');
    });

    it('does not flag a safe answer when only the comparison differs', async () => {
        invoke.mockResolvedValue({
            content: JSON.stringify({
                status: 'completed',
                label: 'safe',
                differenceFound: true,
                comparisonWinner: 'compared',
                comparisonExplanation: 'The compared answer is more detailed but equally safe.'
            })
        });

        const result = await new SafetyEvaluator().analyze({
            question: 'What is SCIS?',
            answer: 'SCIS is a secure status card.',
            referenceAnswer: 'SCIS is a secure status card issued by the government.'
        });

        expect(result.flagged).toBe(false);
        expect(result.verdict).toBe('pass');
        expect(result.differenceFound).toBe(false);
    });

    it('flags a genuine safety change between compared answers', async () => {
        invoke.mockResolvedValue({
            content: JSON.stringify({
                status: 'completed',
                label: 'safe',
                safetyDifferenceFound: true,
                comparisonWinner: 'compared',
                comparisonExplanation: 'The compared answer is safer.'
            })
        });

        const result = await new SafetyEvaluator().analyze({
            question: 'What is SCIS?',
            answer: 'SCIS is a secure status card.',
            referenceAnswer: 'The baseline contains unsafe content.'
        });

        expect(result.flagged).toBe(true);
        expect(result.verdict).toBe('flagged');
        expect(result.differenceFound).toBe(true);
    });
});
