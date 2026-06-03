import { PROMPT } from '../prompts/piiAgentPrompt.js';

export const piiStrategy = {
  // request: { chatId, question }
  buildMessages: (request = {}) => {
    const { question = '' } = request;
    const system = { role: 'system', content: PROMPT };
    const user = { role: 'user', content: question };
    return [system, user];
  },

  // normalized: { content, model, inputTokens, outputTokens, raw }
  parse: (normalized = {}, _request = {}) => {
    const text = normalized?.content || '';
    const raw = normalized?.raw || {};
    // Attempt to extract <pii>...</pii>
    const piiMatch = text.match(/<pii>(.*?)<\/pii>/s);
    let pii = piiMatch ? piiMatch[1].trim() : null;
    if (pii === 'null') pii = null;

    // Guard against false positives where the model echoes the original text
    // inside <pii> tags without any actual redaction marker.
    const hasRedactionMarker = typeof pii === 'string' && /\bXXX\b/.test(pii);
    if (pii && !hasRedactionMarker) {
      pii = null;
    }

    // finish reason might be on raw.response_metadata.finish_reason
    const finishReason = raw?.response_metadata?.finish_reason;

    const inputTokens = normalized.inputTokens ?? null;
    const outputTokens = normalized.outputTokens ?? null;
    const model = normalized.model ?? null;

    if (finishReason && finishReason !== 'stop') {
      return {
        pii: null,
        blocked: true,
        inputTokens,
        outputTokens,
        model,
      };
    }

    return {
      pii,
      blocked: false,
      inputTokens,
      outputTokens,
      model,
    };
  },
};

export default piiStrategy;
