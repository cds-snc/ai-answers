import ServerLoggingService from '../../../services/ServerLoggingService.js';
import { BLOCK_TYPE } from './blockTypes.js';
import { RedactionError } from './errors.js';
import { assertNoBlockingRedactions } from './redactionGuardrail.js';
import { checkTranslatedPii } from './piiGuardrail.js';
import { redactionService } from '../services/redactionService.js';
import { translateQuestion as translateService } from '../services/translationService.js';

// Canadian Indigenous language iso3 codes (incl. macrolanguage codes) that are
// not yet supported. The translation prompt is asked to emit "und" for these,
// but that LLM signal is unreliable: it tends to return the precise variant code
// instead (e.g. "ike" for Eastern Canadian Inuktitut, not "und"). This set is the
// deterministic backstop — any code here is treated exactly like "und". Not
// exhaustive; extend as new variants are observed.
export const UNSUPPORTED_INDIGENOUS_ISO3 = new Set([
  // Inuit
  'iku', 'ike', 'ikt',
  // Cree
  'cre', 'crj', 'crk', 'crl', 'crm', 'csw', 'cwd',
  // Innu / Naskapi / Atikamekw
  'moe', 'nsk', 'atj',
  // Michif
  'crg',
  // Ojibwe family (incl. Oji-Cree / Severn)
  'oji', 'ojb', 'ojc', 'ojg', 'ojs', 'ojw', 'otw', 'ciw',
  // Algonquian (other)
  'alq', 'mic', 'bla',
  // Dene / Athabaskan
  'chp', 'dgr', 'den', 'scs', 'xsl', 'gwi', 'crx', 'caf', 'bea', 'sek', 'kkz', 'tht',
  // Haida / Tsimshianic
  'hai', 'hdn', 'hax', 'git', 'ncg', 'tsi',
  // Iroquoian
  'moh', 'one', 'cay', 'tus',
]);

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
  if (sourceLang === 'und' || UNSUPPORTED_INDIGENOUS_ISO3.has(sourceLang)) {
    await ServerLoggingService.info('postTranslateGuard und hard-block (unsupported language)', chatId, {
      detectedLanguage: sourceLang,
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
