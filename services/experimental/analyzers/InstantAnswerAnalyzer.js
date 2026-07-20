import AnalyzerBase from './AnalyzerBase.js';
import { pickReferenceAnswer } from '../datasetColumns.js';

// Keep this list beside the analyzer validation so adding a workflow with an
// instant-answer step cannot silently make this analyzer invalid.
export const INSTANT_ANSWER_WORKFLOWS = [
    'DefaultWithVectorGraph',
    'DefaultWithLocalModel',
    'InstantAndQAGraph'
];

export class InstantAnswerAnalyzer extends AnalyzerBase {
    static id = 'instant-answer';
    static inputType = 'comparison';
    static outputColumns = [
        'explanation',
        'referenceAnswer',
        'currentAnswer',
        'answersIdentical',
        'instantAnswerUsed',
        'workflow',
        'debugPayload'
    ];

    static validateBatch(items, config = {}) {
        if (!INSTANT_ANSWER_WORKFLOWS.includes(config.workflow)) {
            return {
                valid: false,
                code: 'WORKFLOW_NO_INSTANT_ANSWER',
                localeKey: 'experimental.analysis.messages.error.WORKFLOW_NO_INSTANT_ANSWER'
            };
        }

        const hasReference = Array.isArray(items)
            && items.some(item => String(pickReferenceAnswer(item) || '').trim() !== '');
        if (!hasReference) {
            return {
                valid: false,
                code: 'NO_REFERENCE',
                localeKey: 'experimental.analysis.messages.error.NO_REFERENCE_INSTANT_ANSWER'
            };
        }

        return { valid: true };
    }

    async analyze(input) {
        const answer = input?.answer || '';
        const referenceAnswer = input?.referenceAnswer || '';
        const debugPayload = input?.workflowDebugPayload || null;
        const instantAnswerUsed = debugPayload?.shortCircuit === true;
        const answersIdentical = answer === referenceAnswer;
        const differences = [];

        if (!instantAnswerUsed) differences.push('The workflow did not use its instant-answer short-circuit.');
        if (!answersIdentical) differences.push('The generated answer is not identical to the golden reference answer.');

        const flagged = differences.length > 0;
        return {
            status: flagged ? 'flagged' : 'pass',
            label: flagged ? 'instant-answer-validation-failed' : 'instant-answer-validation-passed',
            flagged,
            differenceFound: flagged,
            explanation: flagged ? differences.join(' ') : 'The instant answer was used and exactly matched the golden reference answer.',
            referenceAnswer,
            currentAnswer: answer,
            answersIdentical,
            instantAnswerUsed,
            workflow: input?.config?.workflow || '',
            debugPayload
        };
    }
}

export default InstantAnswerAnalyzer;
