import AnalyzerBase from './AnalyzerBase.js';
import { createJudgeLLM } from '../../../agents/AgentFactory.js';
import { EXPERT_SCORER_PROMPT } from '../../../agents/prompts/judges/ExpertScorerPrompt.js';

export class ExpertScorerAnalyzer extends AnalyzerBase {
    static id = 'expert-scorer';
    static name = 'Expert Scorer';
    static description = 'Audits answer against a baseline for semantic equivalence and GC standard compliance. Can compare against previous runs.';
    static inputType = 'universal';
    static outputColumns = ['verdict', 'confidence', 'explanation', 'flags', 'keyIdeasFound', 'keyIdeasMissing', 'extraInfoValid', 'answerTypeCheck'];

    constructor(config = {}) {
        super(config);
        this.llm = null;
    }

    async _getLLM() {
        if (!this.llm) {
            this.llm = await createJudgeLLM(this.config.aiProvider || 'azure');
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
        const { question, answer, baselineAnswer, originalData } = input;

        // 1. Pre-LLM auto-checks
        const baselineType = baselineAnswer ? this._getAnswerType(baselineAnswer) : 'n/a';
        const answerType = this._getAnswerType(answer);

        if (!answer || answer.trim() === '') {
            return {
                verdict: 'fail',
                confidence: 1.0,
                explanation: 'New answer is empty.',
                answerTypeCheck: { goldenType: baselineType, newType: 'empty', flag: 'regression' }
            };
        }

        // normal -> not-gc is a regression (only if baseline exists)
        if (baselineAnswer && baselineType === 'normal' && answerType === 'not-gc') {
            return {
                verdict: 'fail',
                confidence: 1.0,
                explanation: 'Answer type regression from normal to not-gc.',
                answerTypeCheck: { goldenType: baselineType, newType: answerType, flag: 'regression' }
            };
        }

        // 2. Prepare Prompt
        const downloadedPages = originalData?.downloadedPages
            ? originalData.downloadedPages.map((p, i) => `PAGE ${i + 1}:\n${p}`).join('\n\n')
            : 'No downloaded page content available.';

        let prompt;
        if (baselineAnswer) {
            prompt = EXPERT_SCORER_PROMPT
                .replace('{question}', question)
                .replace('{baselineAnswer}', baselineAnswer)
                .replace('{baselineAnswerType}', baselineType)
                .replace('{answer}', answer)
                .replace('{answerType}', answerType)
                .replace('{downloadedPages}', downloadedPages);
        } else {
            // General quality check if no baseline
            prompt = `You are an expert evaluator for a Government of Canada AI service.
Evaluate the "Answer" to the "Question" for accuracy and adherence to GC standards.

QUESTION: ${question}
ANSWER: ${answer}

DOCUMENT CONTEXT:
${downloadedPages}

Return ONLY a JSON object:
{
  "verdict": "pass" | "fail" | "needs-review",
  "confidence": 0.0-1.0,
  "explanation": "Detailed rationale",
  "keyIdeasFound": ["list"],
  "keyIdeasMissing": ["list"],
  "flags": []
}`;
        }

        // 3. Call LLM
        const llm = await this._getLLM();
        const response = await llm.invoke([{ role: 'user', content: prompt }]);

        try {
            const result = JSON.parse(response.content.trim().replace(/^```json/, '').replace(/```$/, ''));

            // Auto-tag needs-review for certain type changes if LLM didn't already fail it
            if (baselineType === 'normal' && answerType === 'clarifying-question' && result.verdict === 'pass') {
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
