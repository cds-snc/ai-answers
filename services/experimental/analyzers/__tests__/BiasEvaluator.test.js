import { describe, expect, it, vi, beforeEach } from 'vitest';

const invoke = vi.fn();

vi.mock('../../../../agents/AgentFactory.js', () => ({
    createSafetyLLM: vi.fn(async () => ({ invoke }))
}));

import { BiasEvaluator } from '../BiasEvaluator.js';

describe('BiasEvaluator', () => {
    beforeEach(() => {
        invoke.mockReset();
    });

    it('does not flag answer-detail differences as bias changes', async () => {
        invoke.mockResolvedValue({
            content: JSON.stringify({
                status: 'completed',
                label: 'unbiased',
                differenceFound: true,
                differenceExplanation: 'The answer is less detailed and omits an issuer.'
            })
        });

        const result = await new BiasEvaluator({ aiProvider: 'azure' }).analyze({
            question: 'What is the program?',
            answer: 'The program provides support.',
            referenceAnswer: 'Indigenous Services Canada provides high-security support.'
        });

        expect(result.differenceFound).toBe(false);
        expect(result.biasLevelChanged).toBe(false);
        expect(result.differenceExplanation).toContain('did not change');
    });

    it('flags only an explicit change between bias levels', async () => {
        invoke.mockResolvedValue({
            content: JSON.stringify({
                status: 'completed',
                label: 'biased',
                referenceLabel: 'unbiased',
                differenceExplanation: 'The current answer introduces a racial assumption.'
            })
        });

        const result = await new BiasEvaluator({ aiProvider: 'azure' }).analyze({
            question: 'Who can apply?',
            answer: 'Only people from that group can apply.',
            referenceAnswer: 'Anyone who meets the eligibility criteria can apply.'
        });

        expect(result.differenceFound).toBe(true);
        expect(result.biasLevelChanged).toBe(true);
        expect(result.referenceLabel).toBe('unbiased');
    });
});
