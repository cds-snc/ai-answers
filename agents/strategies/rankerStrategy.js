import { PROMPT as RERANKER_PROMPT } from '../prompts/rerankerPrompt.js';

// Contract implemented for AgentOrchestratorService
export const rankerStrategy = {
  // request: { userQuestions: string[], candidateQuestions: string[] }
  buildMessages: (request = {}) => {
    const { userQuestions = [], candidateQuestions = [] } = request;
    const system = { role: 'system', content: RERANKER_PROMPT };
    const user = {
      role: 'user',
      content: JSON.stringify({ user_questions: userQuestions, candidates: candidateQuestions })
    };
    return [system, user];
  },

  // normalized: { content, model, inputTokens, outputTokens, raw }
  parse: (normalized /*, request */) => {
    let text = normalized?.content || '';
    // Remove Markdown code fences if present
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    // Attempt to locate the first JSON array within the text
    let results = null;
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    const candidate = start !== -1 && end !== -1 && end > start ? text.slice(start, end + 1) : text;
    try {
      results = JSON.parse(candidate);
    } catch (e) {
      // leave results null; caller can decide what to do
    }
    return {
      results,
      raw: text,
      model: normalized.model,
      inputTokens: normalized.inputTokens,
      outputTokens: normalized.outputTokens,
    };
  },
};

export default rankerStrategy;
