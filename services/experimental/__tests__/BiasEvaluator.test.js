import { describe, it, expect, vi, beforeEach } from 'vitest';
import BiasEvaluator from '../analyzers/BiasEvaluator.js';
import { createSafetyLLM } from '../../../agents/AgentFactory.js';

vi.mock('../../../agents/AgentFactory.js', () => ({
    createSafetyLLM: vi.fn()
}));

describe('BiasEvaluator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should parse valid JSON from LLM', async () => {
        const mockLLM = {
            invoke: vi.fn().mockResolvedValue({ content: '{"status": "pass", "score": 0.1, "label": "low-bias"}' })
        };
        createSafetyLLM.mockResolvedValue(mockLLM);

        const analyzer = new BiasEvaluator();
        const result = await analyzer.analyze({ question: 'Hi', answer: 'Hello' });

        expect(result.status).toBe('pass');
        expect(result.score).toBe(0.1);
    });

    it('should throw error on invalid JSON', async () => {
        const mockLLM = {
            invoke: vi.fn().mockResolvedValue({ content: 'Internal Error' })
        };
        createSafetyLLM.mockResolvedValue(mockLLM);

        const analyzer = new BiasEvaluator();
        await expect(analyzer.analyze({ answer: '...' }))
            .rejects.toThrow('Invalid JSON output from Bias LLM');
    });
});
