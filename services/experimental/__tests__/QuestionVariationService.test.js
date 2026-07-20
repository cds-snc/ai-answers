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

    it('fails fast when the model repeats the original question', async () => {
        createQuestionVariationAgent.mockResolvedValue({
            invoke: vi.fn().mockResolvedValue({
                content: JSON.stringify([{ index: 0, variants: ['What is SCIS?'] }])
            })
        });
        const service = new QuestionVariationService();

        await expect(service.createVariants([
            { question: 'What is SCIS?', answer: 'SCIS is a status card.' }
        ], 1)).rejects.toThrow('invalid variants for item 0');
    });
});
