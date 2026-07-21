import { describe, expect, it } from 'vitest';
import { flattenAnalyzerValue } from './batchItems.js';

describe('flattenAnalyzerValue', () => {
    it('flattens nested objects and arrays into generic column paths', () => {
        expect(flattenAnalyzerValue({
            debugPayload: {
                vectorMatches: [{ similarity: 0.91 }],
                llmSelection: { accepted: false }
            }
        })).toEqual({
            'debugPayload.vectorMatches.0.similarity': 0.91,
            'debugPayload.llmSelection.accepted': false
        });
    });

    it('keeps empty arrays and null values visible', () => {
        expect(flattenAnalyzerValue({ matches: [], selection: null })).toEqual({
            matches: [],
            selection: null
        });
    });
});
