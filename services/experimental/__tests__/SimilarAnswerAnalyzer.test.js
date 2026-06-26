import { describe, it, expect, vi, beforeEach } from 'vitest';
import SimilarAnswerAnalyzer from '../analyzers/SimilarAnswerAnalyzer.js';
import { createJudgeLLM } from '../../../agents/AgentFactory.js';

vi.mock('../../../agents/AgentFactory.js', () => ({
    createJudgeLLM: vi.fn()
}));

describe('SimilarAnswerAnalyzer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does nothing on a first run with no baseline answer', async () => {
        const analyzer = new SimilarAnswerAnalyzer();

        const result = await analyzer.analyze({
            question: 'When is the deadline?',
            answer: 'The deadline is June 1, 2026.'
        });

        expect(result.status).toBe('baseline');
        expect(result.label).toBe('no-baseline');
        expect(result.flagged).toBe(false);
        expect(result.differenceFound).toBe(false);
        expect(createJudgeLLM).not.toHaveBeenCalled();
    });

    it('passes identical answers without calling the judge', async () => {
        const analyzer = new SimilarAnswerAnalyzer();

        const result = await analyzer.analyze({
            answer: '<s-1>The deadline is June 1, 2026.</s-1>',
            baselineAnswer: 'The deadline is June 1, 2026.'
        });

        expect(result.status).toBe('pass');
        expect(result.flagged).toBe(false);
        expect(result.differenceFound).toBe(false);
        expect(createJudgeLLM).not.toHaveBeenCalled();
    });

    it('flags an empty current answer against a populated baseline without calling the judge', async () => {
        const analyzer = new SimilarAnswerAnalyzer();

        const result = await analyzer.analyze({
            answer: '',
            baselineAnswer: 'Apply by June 1, 2026.'
        });

        expect(result.status).toBe('flagged');
        expect(result.label).toBe('empty-current-answer');
        expect(result.flagged).toBe(true);
        expect(result.differenceFound).toBe(true);
        expect(result.changedFacts[0].type).toBe('answer-type');
        expect(createJudgeLLM).not.toHaveBeenCalled();
    });

    it('uses the judge to flag meaningful answer drift', async () => {
        const mockLLM = {
            invoke: vi.fn().mockResolvedValue({
                content: '```json\n{"status":"flagged","label":"meaning-drift","differenceFound":true,"confidence":0.97,"differenceExplanation":"The deadline changed.","changedFacts":[{"type":"date","baseline":"June 1, 2026","current":"July 1, 2026","impact":"Different filing deadline."}],"baselineOnlyFacts":[],"currentOnlyFacts":[],"ignoredDifferences":[]}\n```'
            })
        };
        createJudgeLLM.mockResolvedValue(mockLLM);

        const analyzer = new SimilarAnswerAnalyzer();
        const result = await analyzer.analyze({
            question: 'When is the deadline?',
            answer: 'The deadline is July 1, 2026.',
            baselineAnswer: 'The deadline is June 1, 2026.'
        });

        expect(createJudgeLLM).toHaveBeenCalledWith('azure');
        expect(mockLLM.invoke).toHaveBeenCalledWith([
            expect.objectContaining({
                role: 'user',
                content: expect.stringContaining('dates, deadlines')
            })
        ]);
        expect(result.status).toBe('flagged');
        expect(result.flagged).toBe(true);
        expect(result.differenceFound).toBe(true);
        expect(result.changedFacts[0].type).toBe('date');
    });

    it('maps openai-gpt51 to a supported judge model token', async () => {
        const mockLLM = {
            invoke: vi.fn().mockResolvedValue({
                content: '{"status":"pass","label":"same-meaning","differenceFound":false,"confidence":0.9,"differenceExplanation":"Same meaning."}'
            })
        };
        createJudgeLLM.mockResolvedValue(mockLLM);

        const analyzer = new SimilarAnswerAnalyzer({ aiProvider: 'openai-gpt51' });
        await analyzer.analyze({
            answer: 'You can renew online.',
            baselineAnswer: 'Renew online.'
        });

        expect(createJudgeLLM).toHaveBeenCalledWith('openai-gpt5-mini');
    });

    it('throws on invalid judge JSON', async () => {
        const mockLLM = {
            invoke: vi.fn().mockResolvedValue({ content: 'not json' })
        };
        createJudgeLLM.mockResolvedValue(mockLLM);

        const analyzer = new SimilarAnswerAnalyzer();

        await expect(analyzer.analyze({
            answer: 'The current answer.',
            baselineAnswer: 'The baseline answer.'
        })).rejects.toThrow('Invalid JSON output from Similar Answer Judge LLM');
    });
});
