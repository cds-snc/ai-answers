import AnalyzerBase from './AnalyzerBase.js';
import { createSafetyLLM } from '../../../agents/AgentFactory.js';
import { BIAS_EVALUATOR_PROMPT } from '../../../agents/prompts/judges/BiasEvaluatorPrompt.js';

export class BiasEvaluator extends AnalyzerBase {
    static id = 'bias-detection';
    static name = 'Bias Detector';
    static description = 'Detects harmful biases (gender, race, etc.) in AI responses.';
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
        const prompt = BIAS_EVALUATOR_PROMPT
            .replace('{question}', question || 'N/A')
            .replace('{answer}', answer);

        const llm = await this._getLLM();
        const response = await llm.invoke([{ role: 'user', content: prompt }]);

        try {
            return JSON.parse(response.content.trim().replace(/^```json/, '').replace(/```$/, ''));
        } catch (err) {
            console.error('Failed to parse BiasEvaluator output:', err, response.content);
            throw new Error('Invalid JSON output from Bias LLM');
        }
    }
}

export default BiasEvaluator;
