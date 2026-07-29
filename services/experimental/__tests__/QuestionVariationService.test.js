import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuestionVariationAgent } from '../../../agents/AgentFactory.js';
import { QuestionVariationService } from '../QuestionVariationService.js';

vi.mock('../../../agents/AgentFactory.js', () => ({
    createQuestionVariationAgent: vi.fn()
}));

describe('QuestionVariationService', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns the requested variants in source-item order', async () => {
        const invoke = vi.fn().mockResolvedValue({
            content: JSON.stringify([
                { index: 0, variants: ['Could you explain SCIS?', 'What does SCIS mean?'] },
                { index: 1, variants: ['Who qualifies for benefit X?', 'For benefit X, who is eligible?'] }
            ])
        });
        createQuestionVariationAgent.mockResolvedValue({ invoke });
        const service = new QuestionVariationService();

        const result = await service.createVariants([
            { question: 'What is SCIS?', answer: 'SCIS is a status card.' },
            { question: 'Who is eligible for benefit X?', answer: 'People who meet the criteria.' }
        ], 2);

        expect(result).toEqual([
            ['Could you explain SCIS?', 'What does SCIS mean?'],
            ['Who qualifies for benefit X?', 'For benefit X, who is eligible?']
        ]);
        expect(invoke).toHaveBeenCalledOnce();
        expect(invoke.mock.calls[0][0][0].content).toContain('complete meaning');
        expect(JSON.parse(invoke.mock.calls[0][0][1].content)).toMatchObject({ variants_per_question: 2 });
    });

    it('retries invalid variants with validation feedback and skips the item after two retries', async () => {
        const invoke = vi.fn()
            .mockResolvedValue({
                content: JSON.stringify([{ index: 0, variants: ['What is SCIS?'] }])
            });
        createQuestionVariationAgent.mockResolvedValue({ invoke });
        const service = new QuestionVariationService();

        await expect(service.createVariants([
            { question: 'What is SCIS?', answer: 'SCIS is a status card.' }
        ], 1)).resolves.toEqual([null]);

        expect(invoke).toHaveBeenCalledTimes(3);
        expect(invoke.mock.calls[1][0][1].content).toContain('repeats the original question');
    });

    it('keeps valid items when another item remains invalid', async () => {
        createQuestionVariationAgent.mockResolvedValue({
            invoke: vi.fn().mockResolvedValue({
                content: JSON.stringify([
                    { index: 0, variants: ['Could you explain SCIS?'] },
                    { index: 1, variants: ['Who qualifies for benefit X?'] }
                ])
            })
        });
        const service = new QuestionVariationService();

        await expect(service.createVariants([
            { question: 'What is SCIS?', answer: 'SCIS is a status card.' },
            { question: 'Who qualifies for benefit X?', answer: 'People who meet the criteria.' }
        ], 1)).resolves.toEqual([
            ['Could you explain SCIS?'],
            null
        ]);
    });
});
