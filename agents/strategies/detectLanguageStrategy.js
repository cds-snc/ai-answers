import { PROMPT as DETECT_PROMPT } from '../prompts/detectLanguagePrompt.js';

export const detectLanguageStrategy = {
  // request: { text: string }
  buildMessages: (request = {}) => {
    const { text = '' } = request;
    const system = { role: 'system', content: DETECT_PROMPT };
    const user = { role: 'user', content: JSON.stringify({ text }) };
    return [system, user];
  },

  // normalized: { content, model, inputTokens, outputTokens, raw }
  parse: (normalized /*, request */) => {
    let text = normalized?.content || '';
    // Strip triple-backtick fences if present
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    let result = null;
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      const candidate = start !== -1 && end !== -1 && end > start ? text.slice(start, end + 1) : text;
      result = JSON.parse(candidate);
    } catch (e) {
      // If parsing fails, attempt to salvage common patterns: look for iso3 and language labels
      const iso3Match = text.match(/\b([a-z]{3})\b/i);
      const langMatch = text.match(/"?language"?\s*[:=]\s*"?([A-Za-z\s-]+)"?/i) || text.match(/Language:\s*([A-Za-z\s-]+)/i);
      result = {
        iso3: iso3Match ? iso3Match[1].toLowerCase() : null,
        language: langMatch ? langMatch[1].trim() : 'Unknown'
      };
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

export default detectLanguageStrategy;
