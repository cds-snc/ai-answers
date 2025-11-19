import { AgentOrchestratorService } from '../../../agents/AgentOrchestratorService.js';
import { createTranslationAgent } from '../../../agents/AgentFactory.js';
import { translationStrategy } from '../../../agents/strategies/translationStrategy.js';

export async function translateQuestion({ text, desiredLanguage, selectedAI = 'openai', chatId = 'translate', translationContext = [] }) {
  const createAgentFn = async (agentType, id) => {
    return createTranslationAgent(agentType, id);
  };

  const response = await AgentOrchestratorService.invokeWithStrategy({
    chatId,
    agentType: selectedAI,
  // include translationContext to help the agent detect language across recent user questions
  request: { text, desired_language: desiredLanguage, translation_context: translationContext },
    createAgentFn,
    strategy: translationStrategy,
  });

  if (!response) {
    return {
      originalLanguage: null,
      translatedLanguage: desiredLanguage,
      translatedText: text,
      noTranslation: true,
      originalText: text,
    };
  }

  if (response.noTranslation === true) {
    return {
      originalLanguage: response.originalLanguage || null,
      translatedLanguage: desiredLanguage,
      translatedText: text,
      noTranslation: true,
      originalText: text,
    };
  }

  return {
    ...response,
    originalText: text,
  };
}
