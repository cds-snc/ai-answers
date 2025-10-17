import { PROMPT as TRANSLATION_PROMPT } from '../prompts/translationPrompt.js';

export const translationStrategy = {
  // request: { text: string, desired_language: string, translation_context?: string[] }
  buildMessages: (request = {}) => {
    const { text = '', desired_language = '', translation_context = [] } = request;
    const system = { role: 'system', content: TRANSLATION_PROMPT };
    const user = {
      role: 'user',
      content: JSON.stringify({ text, desired_language, translation_context })
    };
    return [system, user];
  },

  // normalized: { content, model, inputTokens, outputTokens, raw }
  parse: (normalized /*, request */) => {
    let text = normalized?.content || '';
    // Remove triple-backtick fences
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    // Attempt to parse the first JSON object in the response
    let result = null;
    try {
      // If response contains extra text, try to extract the first { .. }
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      const candidate = start !== -1 && end !== -1 && end > start ? text.slice(start, end + 1) : text;
      result = JSON.parse(candidate);
    } catch (e) {
      // leave result null
    }

    return {
      result,
      raw: text,
      model: normalized.model,
      inputTokens: normalized.inputTokens,
      outputTokens: normalized.outputTokens,
    };
  },
};

export default translationStrategy;
