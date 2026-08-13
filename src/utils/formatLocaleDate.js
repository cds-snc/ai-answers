// Shared guard against a raw `new Date(value).toLocaleString()`:
// - a falsy value (null/undefined/'') would otherwise construct `new Date(0)`
//   (the Unix epoch) rather than "no date" — silently showing 1970 instead
//   of the caller's fallback.
// - a malformed value produces an Invalid Date, which renders as the literal
//   text "Invalid Date" rather than anything meaningful.
// Used by SettingsPage.js's audit history date column.
//
// TODO: ScenarioOverridesPage.js has its own near-identical local
// `formatTimestamp` (same guard, plus a fixed year/month/day/hour/minute
// format it'd pass via `options` here) that could migrate onto this shared
// helper instead of staying a second copy. Left alone for now — deliberately
// not bundled into unrelated work; migrate it in its own change so a diff
// touching that page is reviewed for that page's own reasons.
export function formatLocaleDate(value, lang, fallback = null, options) {
  if (!value) return fallback;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', options);
  } catch (error) {
    return fallback;
  }
}
