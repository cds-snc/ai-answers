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

// Admin/eval display rule - two separate, unrelated constraints that happen
// to produce one rule (see docs/coding-agent-docs/official-languages.md for
// the full reasoning):
//   1. EN/FR side - the OL requirement. A question/answer that arrived in
//      French stays displayed in French, full stop, even though an English
//      translation may still exist for it internally (GraphWorkflowHelper.
//      translateQuestion runs unconditionally, so it does). Not a linguistic
//      "native" preference or an absence-of-data coincidence - the same OL
//      requirement that governs every other page in this app.
//   2. Non-EN/FR side - the tool can't output what was never produced.
//      translateQuestion always targets English, never French, so English
//      is the only translated form that can ever exist for a non-EN/FR
//      question - a ceiling on the data, not a fallback of convenience.
// The original-language text is never shown to an admin outside the
// download logs once it isn't EN/FR — chat-export-logs.js already keeps
// full fidelity there independently of this function.
//
// Returns { text, lang, isSource }: `lang` is a ready-to-use BCP-47
// value (or undefined for 'und'/'zxx', same as toLangAttr), `isSource`
// is true only when the non-EN/FR fallback actually fired — the signal an
// "Originally asked in: {language}" pill should key off, not just "language
// isn't en/fr" (an und/zxx question has no meaningful language to show).
// Plain-string version of the "Originally asked in: {language}" label,
// shared by OriginalLanguagePill.js (React, for JSX-rendered surfaces like
// ExpertFeedbackPanel.js) and any DataTables `render` function (which
// returns raw HTML strings, not React elements, so can't use the component
// directly - ChatDashboardPage.js's Question/Answer columns). Both call
// this rather than duplicating the Intl.DisplayNames lookup.
//
// Intl.DisplayNames over a hand-maintained code->name table: it's built
// into every supported browser, already locale-aware (shows the name in
// whatever language `lang` is), and covers far more of BCP-47 than this app
// would want to hand-maintain. Falls back to the raw code on the rare
// unrecognized/unsupported value rather than showing nothing.
// One Intl.DisplayNames instance per display `lang`, reused across every
// languageCode looked up in that language - this is called once per rendered
// pill (e.g. once per row in a DataTables render function), so constructing
// a fresh instance per call would mean re-doing the same per-language ICU
// setup on every row instead of once per dashboard render.
const displayNamesByLang = new Map();
function getDisplayNamesFor(lang) {
  let names = displayNamesByLang.get(lang);
  if (!names) {
    names = new Intl.DisplayNames([lang], { type: 'language' });
    displayNamesByLang.set(lang, names);
  }
  return names;
}

export function getOriginallyAskedInLabel({ languageCode, lang = 'en', t }) {
  // toLangAttr maps 'und'/'zxx' to undefined, so languageCode is falsy for
  // those - deliberately no label, an "Originally asked in: Undetermined"
  // pill wouldn't be meaningful. In practice this can't leave a gap next to
  // a rendered pill either: runPostTranslationGuardrail hard-blocks both
  // 'und' and 'zxx' before an answer is ever generated
  // (agents/graphs/guardrails/translationGuardrail.js), so no interaction
  // that reaches an eval/review UI can have questionLanguage 'und'/'zxx' in
  // the first place.
  if (!languageCode) return '';
  let displayName = languageCode;
  try {
    displayName = getDisplayNamesFor(lang).of(languageCode) || languageCode;
  } catch (e) {
    // Intl.DisplayNames throws on a code it can't resolve at all (not just
    // an unrecognized one, which normally just returns the code back) -
    // rare, but fall back to the raw code rather than letting this crash
    // whatever it's rendered inside.
  }
  return t('admin.common.originallyAskedIn').replace('{language}', () => displayName);
}

// TODO(sentence-pairing-risk): callers that map sentences[i] to
// sentencesEnglish[i] one at a time (ChatInterface.js, FeedbackComponent.js,
// ExpertFeedbackComponent.js, ExpertFeedbackPanel.js) trust that the two
// arrays segment 1:1 in the same order. extractSentences (ChatAppContainer.js)
// only parses the explicit <s-1>...</s-1> tags the model is instructed to
// emit identically in <answer> and <english-answer> - not
// punctuation/NLP sentence-splitting - so the risk is narrowly "did the
// model comply with the tag-count instruction," not a segmentation-algorithm
// mismatch across languages. Believed rare/unconfirmed in production
// (verifiable via a ChatViewer JSON export + scripts/check-chat-logs.js
// --filter answer, per CLAUDE.md); not yet observed, so left as a known,
// low-probability risk rather than fixed now. If it needs fixing: a naive
// `sentences.length === sentencesEnglish.length` guard falling back to
// `english: undefined` is NOT a safe fix on its own - `isSource` below is
// derived from `hasEnglish`, so that guard silently makes a genuinely
// non-EN/FR answer look like ordinary already-EN/FR content: the
// OriginalLanguagePill goes dark in ExpertFeedbackPanel.js/
// SourceViewComponent.js, and FeedbackComponent.js's `isSource`
// gate (deciding whether to show "Review the English source text" at all
// before rating) goes false, meaning a reviewer would be dropped straight
// into Good/Needs improvement on unreadable text with zero indication
// translation was needed. A real fix needs `resolveDisplayContent` to
// distinguish "needed translation but unavailable" from "never needed
// translation" (e.g. a separate `needsTranslation` field, independent of
// `hasEnglish`) before any caller can safely fall back to original-only
// display on a count mismatch.
export function resolveDisplayContent({ language, original, english }) {
  const code = (language || '').trim().toLowerCase();
  const isEnglishOrFrench = code === 'eng' || code === 'en' || code === 'fra' || code === 'fr';
  if (isEnglishOrFrench || !code) {
    // No detected language at all (legacy data, or a field this wasn't
    // wired up for yet) defaults to showing the original text as-is,
    // untagged — matches current behaviour instead of guessing.
    return { text: original ?? '', lang: isEnglishOrFrench ? toLangAttr(code) : undefined, isSource: false };
  }
  const hasEnglish = typeof english === 'string' && english.trim().length > 0;
  return {
    text: hasEnglish ? english : (original ?? ''),
    lang: hasEnglish ? 'en' : toLangAttr(code),
    isSource: hasEnglish,
  };
}
