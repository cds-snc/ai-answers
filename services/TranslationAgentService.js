import { AgentOrchestratorService } from '../agents/AgentOrchestratorService.js';
import { createTranslationAgent } from '../agents/AgentFactory.js';
import { translationStrategy } from '../agents/strategies/translationStrategy.js';
import ServerLoggingService from './ServerLoggingService.js';

export async function translateQuestion({ text, desiredLanguage, selectedAI = 'openai', chatId = 'translate', translationContext = [] }) {
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
