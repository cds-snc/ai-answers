import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExperimentalAnalyzerRegistry from '../ExperimentalAnalyzerRegistry.js';
import path from 'path';

describe('ExperimentalAnalyzerRegistry', () => {
    beforeEach(() => {
        // Reset registry state
        ExperimentalAnalyzerRegistry.analyzers.clear();
        ExperimentalAnalyzerRegistry.initialized = false;
    });

    it('should be empty initially', () => {
        expect(ExperimentalAnalyzerRegistry.analyzers.size).toBe(0);
    });

    it('should register an analyzer manually', () => {
        const config = {
            name: 'Test',
            description: 'Desc',
            inputType: 'single',
            processor: async () => 'result'
        };
        ExperimentalAnalyzerRegistry.register('test-id', config);
        expect(ExperimentalAnalyzerRegistry.analyzers.has('test-id')).toBe(true);
    });

    it('should initialize and load analyzers from the analyzers directory', async () => {
        await ExperimentalAnalyzerRegistry.initialize();
        const all = await ExperimentalAnalyzerRegistry.getAll();

        // We expect at least the existing analyzers plus the no-op option.
        expect(all.length).toBeGreaterThanOrEqual(4);

        const safety = await ExperimentalAnalyzerRegistry.get('safety');
        expect(safety).toBeDefined();
        expect(safety.name).toBe('Safety Evaluator');

        const noAnalyzer = await ExperimentalAnalyzerRegistry.get('no-analyzer');
        expect(noAnalyzer).toBeDefined();
        expect(noAnalyzer.name).toBe('No analyzer');

        const similarAnswer = await ExperimentalAnalyzerRegistry.get('similar-answer');
        expect(similarAnswer).toBeDefined();
        expect(similarAnswer.name).toBe('Similar Answer Analyzer');
    });

    it('should return undefined for unknown analyzer', async () => {
        const result = await ExperimentalAnalyzerRegistry.get('non-existent');
        expect(result).toBeUndefined();
    });

    it('should provide the processor function', async () => {
        await ExperimentalAnalyzerRegistry.initialize();
        const processor = await ExperimentalAnalyzerRegistry.getProcessor('safety');
        expect(typeof processor).toBe('function');
    });
});
