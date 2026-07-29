import { createQuestionVariationAgent } from '../../agents/AgentFactory.js';
import { QUESTION_VARIATION_PROMPT } from '../../agents/prompts/questionVariationPrompt.js';

const BATCH_SIZE = 10;
const MAX_RETRIES = 2;

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
            return {
                variants: items.map(() => null),
                errors: items.map(item => `item ${item.index}: invalid JSON`)
            };
        }

        if (!Array.isArray(parsed) || parsed.length !== items.length) {
            return {
                variants: items.map(() => null),
                errors: items.map(item => `item ${item.index}: expected ${items.length} results`)
            };
        }

        const byIndex = new Map(parsed.map(result => [result?.index, result]));
        const errors = [];
        const variants = items.map(item => {
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
                const reasons = [];
                if (normalizedVariants.length !== variantsPerQuestion) {
                    reasons.push(`expected ${variantsPerQuestion} variants, got ${normalizedVariants.length}`);
                }
                if (uniqueVariants.size !== normalizedVariants.length) reasons.push('variants must be unique');
                if (uniqueVariants.has(normalizedOriginal)) reasons.push('a variant repeats the original question');
                errors.push(`item ${item.index}: ${reasons.join('; ')}`);
                return null;
            }
            return normalizedVariants;
        });
        return { variants, errors };
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
            const successfulVariants = batch.map(() => null);
            let retryFeedback = '';

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
                let parsed;
                try {
                    const payload = {
                        variants_per_question: variantsPerQuestion,
                        items: batch,
                        ...(retryFeedback ? { retry_feedback: retryFeedback } : {})
                    };
                    const response = await llm.invoke([
                        { role: 'system', content: QUESTION_VARIATION_PROMPT },
                        { role: 'user', content: JSON.stringify(payload) }
                    ]);
                    parsed = this._parseResponse(response.content, batch, variantsPerQuestion);
                } catch (error) {
                    parsed = {
                        variants: batch.map(() => null),
                        errors: [`model invocation failed: ${error?.message || 'unknown error'}`]
                    };
                }

                parsed.variants.forEach((variants, index) => {
                    if (variants) successfulVariants[index] = variants;
                });
                if (parsed.errors.length === 0) break;
                retryFeedback = `The previous response failed validation. Correct these problems and return a complete JSON array: ${parsed.errors.join(' | ')}`;
            }

            allVariants.push(...successfulVariants);
        }

        return allVariants;
    }
}

export default new QuestionVariationService();

