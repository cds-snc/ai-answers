// Resolves the language an answer's content is actually in, across the two real shapes:
// - live, same-session message (before persistence): `interaction.answer.questionLanguage`,
//   set by the graph's answer node (agents/graphs/workflows/GraphWorkflowHelper.js) and
//   streamed straight to the client.
// - reloaded/review-mode message (after persistence): `interaction.question.language`,
//   the same value persisted onto the Question model (services/InteractionPersistenceService.js).
// Returns the raw ISO-639-3-ish code (e.g. "eng", "fra", or a Canadian Indigenous code), or ''.
//
// Called per-message (see formatAIResponse in ChatAppContainer.js) against that message's own
// `interaction`, not shared/conversation-level state - messages are appended immutably
// (`setMessages(prev => [...prev, newMessage])`), so each turn's answer keeps its own detected
// language. If a user switches language mid-conversation (French, then English, then Spanish),
// each answer bubble is tagged independently based on what was actually detected for that turn.
export function getAnswerLanguage(interaction) {
  return interaction?.answer?.questionLanguage
    || interaction?.question?.language
    || '';
}

// Maps a raw language code to the tag used for the answer bubble's `lang` attribute, so
// screen readers/browser TTS pronounce the answer in its actual language instead of
// inheriting the page's lang="en"/"fr" (document.documentElement.lang, set in App.js).
// The answer is genuinely generated in the question's detected language, not just en/fr -
// agents/prompts/agenticBase.js translates the English draft answer into whatever language
// the <output-lang> tag carries (agents/graphs/workflows/GraphWorkflowHelper.js), for any
// language the translation step can identify - so this table needs real per-language entries,
// not just en/fr.
//
// BCP-47 requires the ISO-639-1 two-letter code when one exists for the language, so ISO-639-3
// codes (what the translator returns, per agents/prompts/translationPrompt.js) need mapping to
// their 639-1 form. Covers the languages most commonly seen among Canadian newcomers/immigrants
// plus other major world languages.
//
// Canadian Indigenous languages (UNSUPPORTED_INDIGENOUS_ISO3 in
// agents/graphs/guardrails/translationGuardrail.js) are deliberately NOT in this table and don't
// need to be: by default the guardrail.indigenousLanguageBlocking admin setting (default true)
// hard-blocks these questions before an answer is ever generated, so there's normally nothing to
// tag. If an admin disables that setting and the LLM answers in one of these languages anyway,
// the code (e.g. "crk", "ike") has no ISO-639-1 equivalent and is already a valid BCP-47 primary
// language subtag on its own, so the fallback below passes it through unchanged and it still
// gets tagged correctly - this table does not need a special case for that to work.
const ISO3_TO_BCP47 = {
  eng: 'en',
  fra: 'fr',
  spa: 'es',
  por: 'pt',
  ita: 'it',
  deu: 'de',
  nld: 'nl',
  ell: 'el',
  ron: 'ro',
  pol: 'pl',
  ces: 'cs',
  slk: 'sk',
  hun: 'hu',
  bul: 'bg',
  ukr: 'uk',
  rus: 'ru',
  srp: 'sr',
  hrv: 'hr',
  swe: 'sv',
  dan: 'da',
  nor: 'no',
  fin: 'fi',
  tur: 'tr',
  heb: 'he',
  ara: 'ar',
  arb: 'ar',
  fas: 'fa',
  pes: 'fa',
  urd: 'ur',
  pus: 'ps',
  kur: 'ku',
  hin: 'hi',
  ben: 'bn',
  pan: 'pa',
  guj: 'gu',
  mar: 'mr',
  tam: 'ta',
  tel: 'te',
  mal: 'ml',
  sin: 'si',
  nep: 'ne',
  zho: 'zh',
  cmn: 'zh',
  jpn: 'ja',
  kor: 'ko',
  vie: 'vi',
  tha: 'th',
  khm: 'km',
  lao: 'lo',
  msa: 'ms',
  zsm: 'ms',
  ind: 'id',
  tgl: 'tl',
  fil: 'tl',
  swa: 'sw',
  som: 'so',
  amh: 'am',
};

export function toLangAttr(rawLanguage) {
  if (!rawLanguage) return undefined;
  const code = String(rawLanguage).trim().toLowerCase();
  if (code === 'und' || code === 'zxx') return undefined;
  return ISO3_TO_BCP47[code] || code;
}
