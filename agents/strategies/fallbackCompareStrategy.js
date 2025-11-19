import { PROMPT as FALLBACK_COMPARE_PROMPT } from '../prompts/fallbackComparePrompt.js';

// Contract: buildMessages(request) -> messages for the LLM
// request: { source: string, candidate: string }
export const fallbackCompareStrategy = {
  buildMessages: (request = {}) => {
    const { source = '', candidate = '' } = request;
    const system = { role: 'system', content: FALLBACK_COMPARE_PROMPT };
    const user = {
      role: 'user',
      content: JSON.stringify({ source, candidate })
    };
    return [system, user];
  },

  // parse normalized LLM output into structured result
  // normalized: { content, model, inputTokens, outputTokens, raw }
  parse: (normalized = {}) => {
    let text = normalized?.content || '';
    // strip markdown fences if present
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

    // Try to parse JSON. The agent is instructed to output pure JSON, but be defensive.
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // Attempt to find the first JSON object in the text
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const candidate = text.slice(start, end + 1);
        try {
          parsed = JSON.parse(candidate);
        } catch (e2) {
          parsed = { error: 'invalid_json', raw: text };
        }
      } else {
        parsed = { error: 'invalid_json', raw: text };
      }
    }

    return {
      raw: text,
      parsed,
      model: normalized.model,
      inputTokens: normalized.inputTokens,
      outputTokens: normalized.outputTokens,
    };
  }
};

export default fallbackCompareStrategy;
