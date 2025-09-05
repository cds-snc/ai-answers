import { PROMPT as QUERY_REWRITE_PROMPT } from '../prompts/queryRewriteAgentPrompt.js';

export const queryRewriteStrategy = {
  // request: { translationData: { translatedText, translatedLanguage, originalText, noTranslation }, referringUrl, pageLanguage }
  buildMessages: (request = {}) => {
    const { translationData = {}, referringUrl = '', pageLanguage: pageLanguage = '' } = request;
    const system = { role: 'system', content: QUERY_REWRITE_PROMPT };
    // Provide a JSON blob to the user part so the agent can use structured inputs.
    // The prompt expects a top-level object: { translatedText, pageLanguage, referringUrl }
    // Map common fields from the incoming translationData and fall back where appropriate.
    const translatedText = translationData.translatedText || translationData.originalText || '';
    // Prefer explicit pageLanguage passed in the request, but fall back to translationData fields if needed
    
    const userPayload = {
      translatedText,
      pageLanguage,
      referringUrl: referringUrl || null,
    };

    const user = {
      role: 'user',
      content: JSON.stringify(userPayload)
    };
    return [system, user];
  },

  // normalized: { content, model, inputTokens, outputTokens, raw }
  parse: (normalized = {}) => {
    const text = normalized?.content || '';
    const last = text.trim();
    // Prefer JSON output from the agent
    try {
      const parsedJson = JSON.parse(last);
      return {
        query: parsedJson.query || '',
        model: normalized.model,
        inputTokens: normalized.inputTokens,
        outputTokens: normalized.outputTokens,
      };
    } catch (e) {
      // Fallback to legacy tag parsing
      const queryMatch = last.match(/<query>([\s\S]*?)<\/query>/i);
      const translatedQuestionMatch = last.match(/<translatedQuestion>([\s\S]*?)<\/translatedQuestion>/i);
      const originalLangMatch = last.match(/<originalLang>([\s\S]*?)<\/originalLang>/i);

      const query = queryMatch ? queryMatch[1].trim() : '';
      const translatedQuestion = translatedQuestionMatch ? translatedQuestionMatch[1].trim() : '';
      const originalLang = originalLangMatch ? originalLangMatch[1].trim() : '';

      return {
        query,
        translatedQuestion,
        originalLang,
        raw: last,
        model: normalized.model,
        inputTokens: normalized.inputTokens,
        outputTokens: normalized.outputTokens,
      };
    }
  }
};

export default queryRewriteStrategy;
