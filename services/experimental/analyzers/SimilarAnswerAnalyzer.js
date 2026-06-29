import AnalyzerBase from './AnalyzerBase.js';
import { createJudgeLLM } from '../../../agents/AgentFactory.js';

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

const stripCodeFence = (value) => String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const parseJsonObject = (content) => {
    const stripped = stripCodeFence(content);
    try {
        return JSON.parse(stripped);
    } catch (err) {
        const start = stripped.indexOf('{');
        const end = stripped.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return JSON.parse(stripped.slice(start, end + 1));
        }
        throw err;
    }
};

const toBoolean = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return Boolean(value);
};

export class SimilarAnswerAnalyzer extends AnalyzerBase {
    static id = 'similar-answer';
    static inputType = 'universal';
    static outputColumns = [
        'status',
        'label',
        'flagged',
        'differenceFound',
        'confidence',
        'differenceExplanation',
        'changedFacts',
        'baselineOnlyFacts',
        'currentOnlyFacts',
        'ignoredDifferences'
    ];

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

    _normalize(text) {
        return String(text || '')
            .replace(/<s-\d+>/gi, '')
            .replace(/<\/s-\d+>/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    _buildPrompt({ question, answer, baselineAnswer }) {
        return `You are a strict answer-drift analyzer for an experiment system.

Compare the BASELINE ANSWER from a previous run against the CURRENT ANSWER from a new run.
Your job is to notice meaningful differences. Be especially sensitive to concrete facts:
- dates, deadlines, months, years, durations, timeframes, and effective dates
- numbers, amounts, percentages, limits, counts, ages, scores, fees, rates, and units
- named objects, programs, forms, documents, benefits, departments, tools, URLs, contact channels, and places
- eligibility rules, required conditions, exceptions, warnings, steps, order of operations, and jurisdiction
- answer type changes, such as substantive answer versus refusal, not-GC, provincial/territorial/municipal scope, or clarifying question

Flag a difference when the answers would lead a user to a different understanding or action, or when either answer adds/removes a material fact, condition, date, number, named object, step, exception, warning, or scope limit.
Do not flag harmless rewording, formatting, sentence IDs, reordered equivalent points, or tone differences when the meaning and all material facts match.
If you are uncertain whether a concrete difference matters, use "needs-review" and explain the uncertainty.

QUESTION:
${question || 'N/A'}

BASELINE ANSWER:
${baselineAnswer}

CURRENT ANSWER:
${answer}

Return ONLY a JSON object with this shape:
{
  "status": "pass" | "flagged" | "needs-review",
  "label": "same-meaning" | "meaning-drift" | "needs-review",
  "differenceFound": true | false,
  "confidence": 0.0,
  "differenceExplanation": "Briefly explain the important difference or why the meanings match.",
  "changedFacts": [
    {
      "type": "date" | "number" | "object" | "eligibility" | "condition" | "step" | "scope" | "answer-type" | "other",
      "baseline": "What the baseline said",
      "current": "What the current answer said",
      "impact": "Why this matters"
    }
  ],
  "baselineOnlyFacts": ["Material facts present only in the baseline answer"],
  "currentOnlyFacts": ["Material facts present only in the current answer"],
  "ignoredDifferences": ["Non-material wording or formatting differences ignored"]
}`;
    }

    _normalizeResult(result) {
        const rawStatus = String(result?.status || '').trim().toLowerCase();
        const status = ['pass', 'flagged', 'needs-review'].includes(rawStatus)
            ? rawStatus
            : (result?.differenceFound ? 'flagged' : 'pass');
        const differenceFound = toBoolean(result?.differenceFound ?? status === 'flagged');
        const flagged = differenceFound || status === 'flagged' || status === 'needs-review';

        return {
            status: flagged && status === 'pass' ? 'flagged' : status,
            label: result?.label || (differenceFound ? 'meaning-drift' : 'same-meaning'),
            flagged,
            differenceFound,
            confidence: typeof result?.confidence === 'number' ? result.confidence : null,
            differenceExplanation: result?.differenceExplanation || '',
            changedFacts: Array.isArray(result?.changedFacts) ? result.changedFacts : [],
            baselineOnlyFacts: Array.isArray(result?.baselineOnlyFacts) ? result.baselineOnlyFacts : [],
            currentOnlyFacts: Array.isArray(result?.currentOnlyFacts) ? result.currentOnlyFacts : [],
            ignoredDifferences: Array.isArray(result?.ignoredDifferences) ? result.ignoredDifferences : []
        };
    }

    async analyze(input) {
        const question = input?.question || '';
        const answer = this._normalize(input?.answer);
        const baselineAnswer = this._normalize(input?.baselineAnswer);

        if (!baselineAnswer) {
            return {
                status: 'baseline',
                label: 'no-baseline',
                flagged: false,
                differenceFound: false,
                confidence: 1,
                differenceExplanation: 'No baseline answer was provided; this run can be used as the baseline for a future comparison.',
                changedFacts: [],
                baselineOnlyFacts: [],
                currentOnlyFacts: [],
                ignoredDifferences: []
            };
        }

        if (!answer) {
            return {
                status: 'flagged',
                label: 'empty-current-answer',
                flagged: true,
                differenceFound: true,
                confidence: 1,
                differenceExplanation: 'Current answer is empty while the baseline has an answer.',
                changedFacts: [{
                    type: 'answer-type',
                    baseline: 'Baseline has an answer.',
                    current: 'Current answer is empty.',
                    impact: 'The current run failed to provide the information that was available in the baseline run.'
                }],
                baselineOnlyFacts: [],
                currentOnlyFacts: [],
                ignoredDifferences: []
            };
        }

        if (answer === baselineAnswer) {
            return {
                status: 'pass',
                label: 'same-meaning',
                flagged: false,
                differenceFound: false,
                confidence: 1,
                differenceExplanation: 'Answers are identical after normalization.',
                changedFacts: [],
                baselineOnlyFacts: [],
                currentOnlyFacts: [],
                ignoredDifferences: []
            };
        }

        const llm = await this._getLLM();
        const prompt = this._buildPrompt({ question, answer, baselineAnswer });
        const response = await llm.invoke([{ role: 'user', content: prompt }]);

        try {
            const content = typeof response.content === 'string'
                ? response.content
                : JSON.stringify(response.content);
            return this._normalizeResult(parseJsonObject(content));
        } catch (err) {
            console.error('Failed to parse SimilarAnswerAnalyzer output:', err, response.content);
            throw new Error('Invalid JSON output from Similar Answer Judge LLM');
        }
    }
}

export default SimilarAnswerAnalyzer;
