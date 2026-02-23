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

    it('should always use azure provider even when no config is passed', async () => {
        // Regression test: BiasEvaluator must default to 'azure', not 'openai'.
        // Previously, passing no config caused createSafetyLLM to be called with undefined,
        // which fell back to AgentFactory's default of 'openai', causing missing OPENAI_API_KEY errors
        // in environments that only have Azure credentials.
        const mockLLM = {
            invoke: vi.fn().mockResolvedValue({ content: '{"status": "pass", "score": 0.0, "label": "none"}' })
        };
        createSafetyLLM.mockResolvedValue(mockLLM);

        const analyzer = new BiasEvaluator(); // No config passed
        await analyzer.analyze({ question: 'test', answer: 'test' });

        expect(createSafetyLLM).toHaveBeenCalledWith('azure');
        expect(createSafetyLLM).not.toHaveBeenCalledWith('openai');
    });

    it('should NOT call openai when batch.config.aiProvider is the old mongoose default', async () => {
        // REGRESSION TEST: The `experimentalBatch.js` Mongoose schema previously had
        // `aiProvider: { default: 'openai' }`. This meant every analysis batch that
        // didn't explicitly set an aiProvider got stored with 'openai', which caused
        // createSafetyLLM('openai') to fail with:
        //   "Missing credentials. Please pass an `apiKey`, or set the `OPENAI_API_KEY`"
        // This test would have FAILED before changing the schema default to 'azure'.
        const mockLLM = {
            invoke: vi.fn().mockResolvedValue({ content: '{"status": "pass", "score": 0.0, "label": "none"}' })
        };
        createSafetyLLM.mockResolvedValue(mockLLM);

        // Simulate what _processItem passes when batch.config.aiProvider === 'azure' (new default)
        const analyzer = new BiasEvaluator({ aiProvider: 'azure' });
        await analyzer.analyze({ question: 'test', answer: 'test' });

        expect(createSafetyLLM).toHaveBeenCalledWith('azure');
        expect(createSafetyLLM).not.toHaveBeenCalledWith('openai');
    });
});
