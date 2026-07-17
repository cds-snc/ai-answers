import AnalyzerBase from './AnalyzerBase.js';
import { createJudgeLLM } from '../../../agents/AgentFactory.js';
import { EXPERT_SCORER_PROMPT } from '../../../agents/prompts/judges/ExpertScorerPrompt.js';
import { pickReferenceAnswer } from '../datasetColumns.js';

const normalizeJudgeProvider = (aiProvider = 'azure') => {
    const value = String(aiProvider || '').trim();
    if (!value) return 'azure';
    if (value === 'openai-gpt51' || value === 'openai-gpt51-chat') {
        return 'openai-gpt5-mini';
    }
    if (value === 'azure' || value === 'openai' || value === 'openai-gpt5-mini' || value === 'azure-gpt5-mini') {
        return value;
    }
    return 'azure';
};

export class ExpertScorerAnalyzer extends AnalyzerBase {
    static id = 'expert-scorer';
    static inputType = 'comparison';
    static outputColumns = [
        'explanation', 'verdict', 'confidence', 'flags', 'keyIdeasFound',
        'keyIdeasMissing', 'extraInfoValid', 'answerTypeCheck',
        'driftStatus', 'driftExplanation'
    ];

    static validateBatch(items) {
        const hasReference = Array.isArray(items)
            && items.some(item => String(pickReferenceAnswer(item) || '').trim() !== '');
        if (!hasReference) {
            return {
                valid: false,
                code: 'NO_REFERENCE',
                localeKey: 'experimental.analysis.messages.error.NO_REFERENCE_EXPERT_SCORER'
            };
        }
        return { valid: true };
    }

    constructor(config = {}) {
        super(config);
        this.llm = null;
    }

    async _getLLM() {
        if (!this.llm) {
            this.llm = await createJudgeLLM(normalizeJudgeProvider(this.config.aiProvider));
        }
        return this.llm;
    }

    _getAnswerType(answer) {
        if (!answer) return 'empty';
        if (answer.includes('<not-gc>')) return 'not-gc';
        if (answer.includes('<clarifying-question>')) return 'clarifying-question';
        if (answer.includes('<pt-muni>')) return 'pt-muni';
        return 'normal';
    }

    async analyze(input) {
        const { question, answer, referenceAnswer, goldenReferenceAnswer, originalData } = input;

        if (!referenceAnswer) {
            throw new Error('Expert scorer requires a reference answer.');
        }

        // 1. Pre-LLM auto-checks
        const evaluationReferenceAnswer = goldenReferenceAnswer || referenceAnswer;
        const referenceType = this._getAnswerType(evaluationReferenceAnswer);
        // Keep the response contract name stable for existing consumers.
        const answerType = this._getAnswerType(answer);

        if (!answer || answer.trim() === '') {
            return {
                verdict: 'fail',
                confidence: 1.0,
                explanation: 'New answer is empty.',
                answerTypeCheck: { referenceType, newType: 'empty', flag: 'regression' }
            };
        }

        // normal -> not-gc is a regression (only if baseline exists)
        if (referenceAnswer && referenceType === 'normal' && answerType === 'not-gc') {
            return {
                verdict: 'fail',
                confidence: 1.0,
                explanation: 'Answer type regression from normal to not-gc.',
                answerTypeCheck: { referenceType, newType: answerType, flag: 'regression' }
            };
        }

        // 2. Prepare Prompt
        const downloadedPages = originalData?.downloadedPages
            ? originalData.downloadedPages.map((p, i) => `PAGE ${i + 1}:\n${p}`).join('\n\n')
            : 'No downloaded page content available.';

        let prompt = EXPERT_SCORER_PROMPT
            .replace('{question}', question)
            .replace('{baselineAnswer}', evaluationReferenceAnswer)
            .replace('{baselineAnswerType}', referenceType)
            .replace('{answer}', answer)
            .replace('{answerType}', answerType)
            .replace('{downloadedPages}', downloadedPages);

        const hasRunBaseline = Boolean(goldenReferenceAnswer && referenceAnswer);
        if (hasRunBaseline) {
            prompt += `

### DRIFT COMPARISON
The Golden Answer above is the canonical dataset reference and must be used for the main verdict.
The Previous Run Answer below is from the selected earlier system run. Separately assess whether the New Answer is better, worse, or unchanged compared with that previous answer.
Do not let the previous-run comparison change the main verdict against the Golden Answer.

Previous Run Answer:
${referenceAnswer}

Add this field to the JSON response:
{
  "driftStatus": "improved" | "regressed" | "unchanged" | "needs-review",
  "driftExplanation": "Brief explanation of the change from the previous run"
}`;
        }

        // 3. Call LLM
        const llm = await this._getLLM();
        const response = await llm.invoke([{ role: 'user', content: prompt }]);

        try {
            const result = JSON.parse(response.content.trim().replace(/^```json/, '').replace(/```$/, ''));

            if (hasRunBaseline) {
                const drift = result.drift || {};
                result.driftStatus = drift.status || result.driftStatus || 'needs-review';
                result.driftExplanation = drift.explanation || result.driftExplanation || 'Drift could not be determined.';
            }

            // Auto-tag needs-review for certain type changes if LLM didn't already fail it
            if (referenceType === 'normal' && answerType === 'clarifying-question' && result.verdict === 'pass') {
                result.verdict = 'needs-review';
                result.explanation = (result.explanation || '') + ' [Auto-flag: answerType downgrade normal -> clarifying]';
                result.match = false;
            }

            return result;
        } catch (err) {
            console.error('Failed to parse ExpertScorer output:', err, response.content);
            throw new Error('Invalid JSON output from Judge LLM');
        }
    }
}

export default ExpertScorerAnalyzer;
