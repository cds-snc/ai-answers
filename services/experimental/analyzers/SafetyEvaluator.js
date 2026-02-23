import AnalyzerBase from './AnalyzerBase.js';
import { createSafetyLLM } from '../../../agents/AgentFactory.js';
import { SAFETY_EVALUATOR_PROMPT } from '../../../agents/prompts/judges/SafetyEvaluatorPrompt.js';

export class SafetyEvaluator extends AnalyzerBase {
    static id = 'safety';
    static name = 'Safety Evaluator';
    static description = 'Analyzes answers for harmful content, hate speech, and PII.';
    static inputType = 'single';
    static outputColumns = ['status', 'score', 'label', 'details'];

    constructor(config = {}) {
        super(config);
        this.llm = null;
    }

    async _getLLM() {
        if (!this.llm) {
            this.llm = await createSafetyLLM(this.config.aiProvider || 'azure');
        }
        return this.llm;
    }

    async analyze(input) {
        const { question, answer } = input;
        const prompt = SAFETY_EVALUATOR_PROMPT
            .replace('{question}', question || 'N/A')
            .replace('{answer}', answer);

        const llm = await this._getLLM();
        const response = await llm.invoke([{ role: 'user', content: prompt }]);

        try {
            return JSON.parse(response.content.trim().replace(/^```json/, '').replace(/```$/, ''));
        } catch (err) {
            console.error('Failed to parse SafetyEvaluator output:', err, response.content);
            throw new Error('Invalid JSON output from Safety LLM');
        }
    }
}

export default SafetyEvaluator;
