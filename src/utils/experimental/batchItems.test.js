import { describe, expect, it } from 'vitest';
import { flattenAnalyzerValue, isReviewShortcut } from './batchItems.js';

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

describe('isReviewShortcut', () => {
    const key = (k, extra = {}) => ({ key: k, target: { tagName: 'BUTTON' }, ...extra });

    it('accepts the plain arrow and Escape keys', () => {
        expect(isReviewShortcut(key('ArrowLeft'))).toBe(true);
        expect(isReviewShortcut(key('ArrowRight'))).toBe(true);
        expect(isReviewShortcut(key('Escape'))).toBe(true);
        expect(isReviewShortcut(key('Enter'))).toBe(false);
    });

    it('leaves browser shortcuts alone', () => {
        expect(isReviewShortcut(key('ArrowLeft', { altKey: true }))).toBe(false);
        expect(isReviewShortcut(key('ArrowRight', { metaKey: true }))).toBe(false);
        expect(isReviewShortcut(key('ArrowLeft', { shiftKey: true }))).toBe(false);
    });

    it('ignores keys typed in a field, including GC DS fields', () => {
        expect(isReviewShortcut(key('ArrowLeft', { target: { tagName: 'INPUT' } }))).toBe(false);
        expect(isReviewShortcut(key('ArrowLeft', { target: { tagName: 'GCDS-TEXTAREA' } }))).toBe(false);
        expect(isReviewShortcut(key('Escape', { target: { tagName: 'DIV', isContentEditable: true } }))).toBe(false);
    });
});
