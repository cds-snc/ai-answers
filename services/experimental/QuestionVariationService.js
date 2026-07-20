import { createQuestionVariationAgent } from '../../agents/AgentFactory.js';
import { QUESTION_VARIATION_PROMPT } from '../../agents/prompts/questionVariationPrompt.js';

const BATCH_SIZE = 10;

const responseText = (content) => {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map(block => typeof block === 'string' ? block : block?.text || '').join('');
};

export class QuestionVariationService {
    constructor() {
        this.llm = null;
    }

    async _getLLM() {
        if (!this.llm) this.llm = await createQuestionVariationAgent();
        return this.llm;
    }

    _parseResponse(content, items, variantsPerQuestion) {
        const text = responseText(content).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new Error('Question variation model returned invalid JSON');
        }

        if (!Array.isArray(parsed) || parsed.length !== items.length) {
            throw new Error('Question variation model returned an incomplete result');
        }

        const byIndex = new Map(parsed.map(result => [result?.index, result]));
        return items.map(item => {
            const result = byIndex.get(item.index);
            const variants = result?.variants;
            const normalizedOriginal = item.question.trim().toLocaleLowerCase();
            const normalizedVariants = Array.isArray(variants)
                ? variants.map(value => typeof value === 'string' ? value.trim() : '').filter(Boolean)
                : [];
            const uniqueVariants = new Set(normalizedVariants.map(value => value.toLocaleLowerCase()));

            if (
                normalizedVariants.length !== variantsPerQuestion
                || uniqueVariants.size !== variantsPerQuestion
                || uniqueVariants.has(normalizedOriginal)
            ) {
                throw new Error(`Question variation model returned invalid variants for item ${item.index}`);
            }
            return normalizedVariants;
        });
    }

    async createVariants(items, variantsPerQuestion) {
        if (!Number.isInteger(variantsPerQuestion) || variantsPerQuestion < 1) return items.map(() => []);
        const allVariants = [];
        const llm = await this._getLLM();

        for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
            const batch = items.slice(offset, offset + BATCH_SIZE).map((item, index) => ({
                index,
                question: item.question,
                golden_answer: item.answer
            }));
            const response = await llm.invoke([
                { role: 'system', content: QUESTION_VARIATION_PROMPT },
                { role: 'user', content: JSON.stringify({ variants_per_question: variantsPerQuestion, items: batch }) }
            ]);
            allVariants.push(...this._parseResponse(response.content, batch, variantsPerQuestion));
        }

        return allVariants;
    }
}

export default new QuestionVariationService();

