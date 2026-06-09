import ServerLoggingService from '../../../services/ServerLoggingService.js';
import { BLOCK_TYPE } from './blockTypes.js';
import { RedactionError } from './errors.js';
import { assertNoBlockingRedactions } from './redactionGuardrail.js';
import { checkTranslatedPii } from './piiGuardrail.js';
import { redactionService } from '../services/redactionService.js';
import { translateQuestion as translateService } from '../services/translationService.js';

export async function translateWithGuardrail(text, lang, selectedAI, translationContext = []) {
  const resp = await translateService({ text, desiredLanguage: lang, selectedAI, translationContext });
  if (resp && resp.blocked === true) {
    await ServerLoggingService.info('translate blocked - graph workflow', null, { resp });
    throw new RedactionError('Blocked content detected in translation', '#############', null, BLOCK_TYPE.AZURE_GUARDRAIL);
  }
  return resp;
}

// Second-stage guardrail: re-run redaction word-lists + regex PII patterns on
// translated English text so manipulation/threats/PII written outside EN/FR are
// still caught. zxx is encoded/obfuscated input; und is unsupported language.
export async function runPostTranslationGuardrail(translationData, chatId, selectedAI, originalLang) {
  const sourceLang = (translationData?.originalLanguage || originalLang || '').toLowerCase();
  if (sourceLang === 'zxx') {
    await ServerLoggingService.info('postTranslateGuard zxx hard-block', chatId, {
      originalText: translationData?.originalText,
      translatedText: translationData?.translatedText,
      translatedLanguage: translationData?.translatedLanguage,
    });
    throw new RedactionError('Blocked encoded/obfuscated input after translation', '#############', null, BLOCK_TYPE.MANIPULATION);
  }
  if (sourceLang === 'und') {
    await ServerLoggingService.info('postTranslateGuard und hard-block (unsupported language)', chatId, {
      originalText: translationData?.originalText,
      translatedText: translationData?.translatedText,
      translatedLanguage: translationData?.translatedLanguage,
    });
    throw new RedactionError('Blocked unsupported language after translation', '#############', null, BLOCK_TYPE.UNSUPPORTED_LANGUAGE);
  }

  const translatedText = translationData?.translatedText;
  if (!translatedText) return;

  const previousLang = redactionService.currentLang;
  try {
    await redactionService.ensureInitialized('en');
    const { redactedItems } = redactionService.redactText(translatedText, 'en');
    assertNoBlockingRedactions('#############', redactedItems, 'Blocked content detected after translation');
  } finally {
    if (previousLang && previousLang !== 'en') {
      await redactionService.ensureInitialized(previousLang);
    }
  }

  const isEnOrFr = ['en', 'eng', 'fr', 'fra'].includes(sourceLang);
  if (isEnOrFr) return;

  let piiResult;
  try {
    piiResult = await checkTranslatedPii({ chatId, translatedText, selectedAI });
  } catch (error) {
    await ServerLoggingService.warn('postTranslateGuard checkPII failed - failing open', chatId, {
      error: error?.message || String(error),
    });
    return;
  }

  if (piiResult?.blocked) {
    throw new RedactionError('Blocked content detected after translation', '#############', null, BLOCK_TYPE.AZURE_GUARDRAIL);
  }
  if (typeof piiResult?.pii === 'string' && piiResult.pii.length > 0) {
    throw new RedactionError('PII detected in user message', piiResult.pii, null, BLOCK_TYPE.PI_STAGE_2);
  }
}
