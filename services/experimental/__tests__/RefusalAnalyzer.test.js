import { describe, it, expect } from 'vitest';
import RefusalAnalyzer from '../analyzers/RefusalAnalyzer.js';

describe('RefusalAnalyzer', () => {
    it('flags a <not-gc> answer as a prompt refusal', async () => {
        const analyzer = new RefusalAnalyzer();

        const result = await analyzer.analyze({
            question: 'Can you help?',
            answer: '<not-gc><s-1>An answer to your question was not found on Government of Canada websites.</s-1></not-gc>'
        });

        expect(result.status).toBe('pass');
        expect(result.label).toBe('refusal-prompt');
        expect(result.refusalDetected).toBe(true);
        expect(result.refusalMode).toBe('prompt');
        expect(result.matchedPhrase).toBe('<not-gc>');
        expect(result.explanation).toContain('prompt refusal');
        expect(result.flagged).toBe(false);
        expect(result.differenceFound).toBe(false);
    });

    it('flags a <pt-muni> answer as a prompt refusal', async () => {
        const analyzer = new RefusalAnalyzer();

        const result = await analyzer.analyze({
            question: 'How do I get a health card?',
            answer: '<pt-muni><s-1>This topic appears to be under provincial or territorial jurisdiction.</s-1></pt-muni>'
        });

        expect(result.status).toBe('pass');
        expect(result.label).toBe('refusal-prompt');
        expect(result.refusalDetected).toBe(true);
        expect(result.refusalMode).toBe('prompt');
        expect(result.matchedPhrase).toBe('<pt-muni>');
        expect(result.flagged).toBe(false);
    });

    it('passes a response without refusal tags even if it sounds apologetic', async () => {
        const analyzer = new RefusalAnalyzer();

        const result = await analyzer.analyze({
            question: 'Can you help?',
            answer: "Sorry, but I can't help with that request."
        });

        expect(result.status).toBe('flagged');
        expect(result.label).toBe('missing-refusal');
        expect(result.refusalDetected).toBe(false);
        expect(result.flagged).toBe(true);
        expect(result.explanation).toContain('does not contain');
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

        expect(result.status).toBe('pass');
        expect(result.label).toBe('refusal-error');
        expect(result.refusalDetected).toBe(true);
        expect(result.refusalMode).toBe('error');
        expect(result.flagged).toBe(false);
    });

    it('flags an application short-query block as a refusal', async () => {
        const analyzer = new RefusalAnalyzer();

        const result = await analyzer.analyze({
            question: 'Form AP-576291',
            answer: '',
            originalData: {
                status: 'failed',
                error: 'Short query detected'
            }
        });

        expect(result.status).toBe('pass');
        expect(result.label).toBe('refusal-error');
        expect(result.refusalDetected).toBe(true);
        expect(result.refusalMode).toBe('error');
        expect(result.matchedPhrase.toLowerCase()).toContain('short query');
        expect(result.flagged).toBe(false);
    });

    it('flags a normal answer when the reference answer refused', async () => {
        const analyzer = new RefusalAnalyzer();

        const result = await analyzer.analyze({
            question: 'Can you help?',
            answer: 'Yes, here is the information you need.',
            referenceAnswer: '<not-gc><s-1>An answer to your question was not found on Government of Canada websites.</s-1></not-gc>'
        });

        expect(result.status).toBe('flagged');
        expect(result.label).toBe('missing-refusal');
        expect(result.refusalDetected).toBe(false);
        expect(result.referenceRefusalDetected).toBe(true);
        expect(result.flagsDiffer).toBe(true);
        expect(result.differenceFound).toBe(true);
        expect(result.comparisonExplanation).toContain('reference');
    });

    it('uses reference analyzer metadata when available', async () => {
        const analyzer = new RefusalAnalyzer();

        const result = await analyzer.analyze({
            question: 'Can you help?',
            answer: 'Yes, here is the information you need.',
            referenceAnalysisResults: {
                refusal: {
                    refusalDetected: true,
                    refusalMode: 'prompt',
                    matchedPhrase: '<not-gc>'
                }
            }
        });

        expect(result.refusalDetected).toBe(false);
        expect(result.referenceRefusalDetected).toBe(true);
        expect(result.referenceRefusalMode).toBe('prompt');
        expect(result.flagsDiffer).toBe(true);
        expect(result.flagged).toBe(true);
    });

    it('flags a refusal-state change in either direction for batch comparisons', async () => {
        const analyzer = new RefusalAnalyzer();
        const comparisonData = { baselineRunId: 'baseline-run', candidateRunId: 'candidate-run' };

        const baselineRefused = await analyzer.analyze({
            answer: 'Here is the information.',
            referenceAnswer: '<not-gc><s-1>No answer was found.</s-1></not-gc>',
            originalData: comparisonData
        });
        const baselineDidNotRefuse = await analyzer.analyze({
            answer: '<not-gc><s-1>No answer was found.</s-1></not-gc>',
            referenceAnswer: 'Here is the information.',
            originalData: comparisonData
        });

        expect(baselineRefused.differenceFound).toBe(true);
        expect(baselineRefused.flagged).toBe(true);
        expect(baselineDidNotRefuse.differenceFound).toBe(true);
        expect(baselineDidNotRefuse.flagged).toBe(true);
    });

    it('flags batch runs that deviate from the dataset reference even when they match each other', async () => {
        const analyzer = new RefusalAnalyzer();
        const result = await analyzer.analyze({
            answer: 'Here is the information.',
            referenceAnswer: 'Here is the information.',
            datasetReferenceAnswer: '<not-gc><s-1>No answer was found.</s-1></not-gc>',
            originalData: { baselineRunId: 'baseline-run', candidateRunId: 'candidate-run' }
        });

        expect(result.differenceFound).toBe(true);
        expect(result.datasetReferenceRefusalDetected).toBe(true);
        expect(result.flagged).toBe(true);
        expect(result.comparisonExplanation).toContain('dataset reference refusal state');
    });
});
