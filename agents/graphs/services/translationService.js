import { translateQuestion as translateFromService } from '../../../services/TranslationAgentService.js';

export async function translateQuestion({ text, desiredLanguage, selectedAI = 'openai', chatId = 'translate', translationContext = [] }) {
  return translateFromService({ text, desiredLanguage, selectedAI, chatId, translationContext });
}
