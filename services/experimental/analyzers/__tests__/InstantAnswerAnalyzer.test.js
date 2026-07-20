import { describe, expect, it } from 'vitest';
import { InstantAnswerAnalyzer, INSTANT_ANSWER_WORKFLOWS } from '../InstantAnswerAnalyzer.js';

describe('InstantAnswerAnalyzer', () => {
    it('rejects workflows without an instant-answer step', () => {
        expect(InstantAnswerAnalyzer.validateBatch(
            [{ question: 'Q', answer: 'Golden' }],
            { workflow: 'GenericGraph' }
        )).toMatchObject({
            valid: false,
            code: 'WORKFLOW_NO_INSTANT_ANSWER'
        });
    });

    it('requires a golden reference answer', () => {
        expect(InstantAnswerAnalyzer.validateBatch(
            [{ question: 'Q' }],
            { workflow: INSTANT_ANSWER_WORKFLOWS[0] }
        )).toMatchObject({ valid: false, code: 'NO_REFERENCE' });
    });

    it('flags a missing short-circuit or non-identical answer', async () => {
        const analyzer = new InstantAnswerAnalyzer();
        const result = await analyzer.analyze({
            answer: 'Current',
            referenceAnswer: 'Golden',
            workflowDebugPayload: { shortCircuit: false, payload: { reason: 'no-match' } },
            config: { workflow: INSTANT_ANSWER_WORKFLOWS[0] }
        });

        expect(result).toMatchObject({
            flagged: true,
            answersIdentical: false,
            instantAnswerUsed: false,
            debugPayload: { payload: { reason: 'no-match' } }
        });
    });

    it('passes only when the instant answer and exact golden answer both match', async () => {
        const analyzer = new InstantAnswerAnalyzer();
        const result = await analyzer.analyze({
            answer: 'Golden',
            referenceAnswer: 'Golden',
            workflowDebugPayload: { shortCircuit: true, payload: { answer: 'Golden' } },
            config: { workflow: INSTANT_ANSWER_WORKFLOWS[0] }
        });

        expect(result).toMatchObject({
            flagged: false,
            answersIdentical: true,
            instantAnswerUsed: true
        });
    });
});
