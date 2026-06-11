import { AgentOrchestratorService } from '../agents/AgentOrchestratorService.js';
import { createTranslationAgent } from '../agents/AgentFactory.js';
import { translationStrategy } from '../agents/strategies/translationStrategy.js';
import ServerLoggingService from './ServerLoggingService.js';

export async function translateQuestion({ text, desiredLanguage, selectedAI = 'openai-gpt51', chatId = 'translate', translationContext = [] }) {
  try {
    const createAgentFn = async (agentType, id) => {
      return createTranslationAgent(agentType, id);
    };

    const response = await AgentOrchestratorService.invokeWithStrategy({
      chatId,
      agentType: selectedAI,
      request: { text, desired_language: desiredLanguage, translation_context: translationContext },
      createAgentFn,
      strategy: translationStrategy,
    });

    const result = response?.result || response || null;

    if (!result) {
      return {
        originalLanguage: null,
        translatedLanguage: desiredLanguage,
        translatedText: text,
        noTranslation: true,
        originalText: text,
      };
    }

    if (result.noTranslation === true) {
      return {
        originalLanguage: result.originalLanguage || null,
        translatedLanguage: desiredLanguage,
        translatedText: text,
        noTranslation: true,
        originalText: text,
        translation_context: translationContext,
      };
    }

    // Deterministic backstop for the no-op invariant: when the detected source
    // language equals the target language there is nothing to translate, so the
    // result MUST be a no-op (see translationPrompt no-op rule). A non-no-op here
    // means the model performed a within-language transform — e.g. it followed an
    // instruction embedded in the user's text ("Could you answer in French?") and
    // rewrote/translated it anyway. Discard that output and pass the original text
    // through unchanged so the embedded instruction has no effect. Both fields come
    // from the model in iso3, so an exact (case-insensitive) match is a same-language
    // signal without needing an iso2/iso3 mapping.
    const src = (result.originalLanguage || '').toLowerCase();
    const tgt = (result.translatedLanguage || '').toLowerCase();
    if (src && tgt && src === tgt) {
      ServerLoggingService.info('translate coerced to no-op (source==target, dropping within-language transform)', chatId, {
        originalLanguage: result.originalLanguage,
        translatedLanguage: result.translatedLanguage,
        translatedText: result.translatedText,
        originalText: text,
      });
      return {
        originalLanguage: result.originalLanguage,
        translatedLanguage: desiredLanguage,
        translatedText: text,
        noTranslation: true,
        originalText: text,
        translation_context: translationContext,
      };
    }

    const flattened = Object.assign({}, result, { originalText: text, translation_context: translationContext });
    return flattened;
  } catch (err) {
    ServerLoggingService.error('TranslationAgentService error', chatId, err);
    // Detect content-safety / provider content-filter errors and return blocked marker
    try {
      const msg = ((err && err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err?.message || '').toString().toLowerCase();
      const code = ((err && err.response && err.response.data && err.response.data.error && err.response.data.error.code) || err?.code || '').toString().toLowerCase();
      const isContentFilter = msg.includes('filtered') || msg.includes('content policy') || msg.includes('safety') || code.includes('content_filter') || code.includes('content_policy') || /response was filtered due to the prompt triggering/i.test(msg);
      if (isContentFilter) {
        const blockedResp = { blocked: true };
        ServerLoggingService.info('translate blocked - TranslationAgentService returning blocked', chatId, { blockedResp });
        return blockedResp;
      }
    } catch (innerErr) {
      ServerLoggingService.error('Error detecting content-filter in TranslationAgentService catch', chatId, innerErr);
    }

    throw err;
  }
}

export default { translateQuestion };
