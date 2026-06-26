import { describe, it, expect } from 'vitest';
import RefusalAnalyzer from '../analyzers/RefusalAnalyzer.js';

describe('RefusalAnalyzer', () => {
    it('flags a <not-gc> answer as a prompt refusal', async () => {
        const analyzer = new RefusalAnalyzer();

        const result = await analyzer.analyze({
            question: 'Can you help?',
            answer: '<not-gc><s-1>An answer to your question was not found on Government of Canada websites.</s-1></not-gc>'
        });

        expect(result.status).toBe('flagged');
        expect(result.label).toBe('refusal-prompt');
        expect(result.refusalDetected).toBe(true);
        expect(result.refusalMode).toBe('prompt');
        expect(result.matchedPhrase).toBe('<not-gc>');
        expect(result.flagged).toBe(true);
        expect(result.differenceFound).toBe(false);
    });

    it('flags a <pt-muni> answer as a prompt refusal', async () => {
        const analyzer = new RefusalAnalyzer();

        const result = await analyzer.analyze({
            question: 'How do I get a health card?',
            answer: '<pt-muni><s-1>This topic appears to be under provincial or territorial jurisdiction.</s-1></pt-muni>'
        });

        expect(result.status).toBe('flagged');
        expect(result.label).toBe('refusal-prompt');
        expect(result.refusalDetected).toBe(true);
        expect(result.refusalMode).toBe('prompt');
        expect(result.matchedPhrase).toBe('<pt-muni>');
        expect(result.flagged).toBe(true);
    });

    it('passes a response without refusal tags even if it sounds apologetic', async () => {
        const analyzer = new RefusalAnalyzer();

        const result = await analyzer.analyze({
            question: 'Can you help?',
            answer: "Sorry, but I can't help with that request."
        });

        expect(result.status).toBe('pass');
        expect(result.label).toBe('no-refusal');
        expect(result.refusalDetected).toBe(false);
        expect(result.flagged).toBe(false);
    });

    it('detects refusal from error/status signals', async () => {
        const analyzer = new RefusalAnalyzer();

        const result = await analyzer.analyze({
            question: 'Can you help?',
            answer: '',
            originalData: {
                status: 'refused',
                error: 'Prompt rejected by safety policy'
            }
        });

        expect(result.status).toBe('flagged');
        expect(result.label).toBe('refusal-error');
        expect(result.refusalDetected).toBe(true);
        expect(result.refusalMode).toBe('error');
        expect(result.flagged).toBe(true);
    });

    it('flags when refusal behavior differs from the baseline result', async () => {
        const analyzer = new RefusalAnalyzer();

        const result = await analyzer.analyze({
            question: 'Can you help?',
            answer: 'Yes, here is the information you need.',
            baselineAnswer: '<not-gc><s-1>An answer to your question was not found on Government of Canada websites.</s-1></not-gc>'
        });

        expect(result.status).toBe('pass');
        expect(result.refusalDetected).toBe(false);
        expect(result.baselineRefusalDetected).toBe(true);
        expect(result.flagsDiffer).toBe(true);
        expect(result.differenceFound).toBe(true);
        expect(result.differenceExplanation).toContain('baseline');
    });

    it('uses baseline analyzer metadata when available', async () => {
        const analyzer = new RefusalAnalyzer();

        const result = await analyzer.analyze({
            question: 'Can you help?',
            answer: 'Yes, here is the information you need.',
            baselineAnalysisResults: {
                refusal: {
                    refusalDetected: true,
                    refusalMode: 'prompt',
                    matchedPhrase: '<not-gc>'
                }
            }
        });

        expect(result.refusalDetected).toBe(false);
        expect(result.baselineRefusalDetected).toBe(true);
        expect(result.baselineRefusalMode).toBe('prompt');
        expect(result.flagsDiffer).toBe(true);
    });
});
