import { describe, it, expect } from 'vitest';
import { wordDiff, normalizeAnswerText } from '../wordDiff.js';

const rebuild = (segments, types) => segments
    .filter(s => types.includes(s.type))
    .map(s => s.text)
    .join(' ');

describe('normalizeAnswerText', () => {
    it('strips sentence markers and collapses whitespace', () => {
        expect(normalizeAnswerText('<s-1>Apply  online.</s-1>\n<s-2>Wait 5 days.</s-2>'))
            .toBe('Apply online. Wait 5 days.');
    });

    it('handles null and undefined', () => {
        expect(normalizeAnswerText(null)).toBe('');
        expect(normalizeAnswerText(undefined)).toBe('');
    });
});

describe('wordDiff', () => {
    it('returns a single same segment for identical texts', () => {
        expect(wordDiff('Apply online today', 'Apply online today'))
            .toEqual([{ type: 'same', text: 'Apply online today' }]);
    });

    it('treats sentence-marker and whitespace differences as identical', () => {
        expect(wordDiff('<s-1>Apply online</s-1>', 'Apply  online'))
            .toEqual([{ type: 'same', text: 'Apply online' }]);
    });

    it('returns empty array when both texts are empty', () => {
        expect(wordDiff('', '')).toEqual([]);
    });

    it('marks everything added when baseline is empty', () => {
        expect(wordDiff('', 'New answer')).toEqual([{ type: 'added', text: 'New answer' }]);
    });

    it('marks everything removed when current is empty', () => {
        expect(wordDiff('Old answer', '')).toEqual([{ type: 'removed', text: 'Old answer' }]);
    });

    it('detects a changed fact in the middle of a sentence', () => {
        const segments = wordDiff(
            'You must wait 5 business days before applying',
            'You must wait 10 business days before applying'
        );

        expect(rebuild(segments, ['same', 'removed']))
            .toBe('You must wait 5 business days before applying');
        expect(rebuild(segments, ['same', 'added']))
            .toBe('You must wait 10 business days before applying');
        expect(segments).toContainEqual({ type: 'removed', text: '5' });
        expect(segments).toContainEqual({ type: 'added', text: '10' });
    });

    it('merges consecutive changed words into one segment', () => {
        const segments = wordDiff(
            'Call the CRA at 1-800-959-8281',
            'Call Service Canada at 1-800-622-6232'
        );

        const removed = segments.filter(s => s.type === 'removed');
        const added = segments.filter(s => s.type === 'added');
        expect(removed).toEqual([
            { type: 'removed', text: 'the CRA' },
            { type: 'removed', text: '1-800-959-8281' }
        ]);
        expect(added).toEqual([
            { type: 'added', text: 'Service Canada' },
            { type: 'added', text: '1-800-622-6232' }
        ]);
    });

    it('reconstructs both inputs exactly from the segments', () => {
        const baseline = 'The grant covers tuition books and housing for eligible students';
        const current = 'The grant covers tuition and transit passes for all students';
        const segments = wordDiff(baseline, current);

        expect(rebuild(segments, ['same', 'removed'])).toBe(baseline);
        expect(rebuild(segments, ['same', 'added'])).toBe(current);
    });

    it('falls back to whole-text segments for very large inputs', () => {
        const baseline = Array.from({ length: 3500 }, (_, i) => `a${i}`).join(' ');
        const current = Array.from({ length: 3500 }, (_, i) => `b${i}`).join(' ');
        const segments = wordDiff(baseline, current);

        expect(segments).toHaveLength(2);
        expect(segments[0].type).toBe('removed');
        expect(segments[1].type).toBe('added');
    });
});
