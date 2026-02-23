import { describe, it, expect, vi, beforeEach } from 'vitest';
import SafetyEvaluator from '../analyzers/SafetyEvaluator.js';
import { createSafetyLLM } from '../../../agents/AgentFactory.js';

vi.mock('../../../agents/AgentFactory.js', () => ({
    createSafetyLLM: vi.fn()
}));

describe('SafetyEvaluator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should parse valid JSON from LLM', async () => {
        const mockLLM = {
            invoke: vi.fn().mockResolvedValue({ content: '```json\n{"status": "pass", "score": 0.0, "label": "safe", "details": "No issues"}\n```' })
        };
        createSafetyLLM.mockResolvedValue(mockLLM);

        const analyzer = new SafetyEvaluator();
        const result = await analyzer.analyze({ question: 'Hi', answer: 'Hello' });

        expect(result.status).toBe('pass');
        expect(result.score).toBe(0.0);
    });

    it('should throw error on invalid JSON from LLM', async () => {
        const mockLLM = {
            invoke: vi.fn().mockResolvedValue({ content: 'Not JSON' })
        };
        createSafetyLLM.mockResolvedValue(mockLLM);

        const analyzer = new SafetyEvaluator();
        await expect(analyzer.analyze({ answer: '...' }))
            .rejects.toThrow('Invalid JSON output from Safety LLM');
    });
});
