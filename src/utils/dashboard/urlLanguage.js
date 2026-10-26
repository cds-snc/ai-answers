// Detects a Canada.ca URL's own language from its path (the reliable
// `/en/...` or `/fr/...` first segment convention), independent of whatever
// language the admin dashboard viewing it happens to be set to. Citation/
// referral URLs shown in a table (CountTable.js) are real, fixed-language
// content pulled from search results or logged data - unlike admin UI chrome,
// their `lang` attribute must describe the link's own destination, not the
// viewer's current page language, or a screen reader announces the wrong
// pronunciation language for it (WCAG 3.1.2).
export function detectUrlLanguage(url, fallbackLang = 'en') {
  if (typeof url !== 'string' || !url) {
    return fallbackLang;
  }

  let pathname;
  try {
    pathname = new URL(url, 'https://www.canada.ca').pathname;
  } catch {
    return fallbackLang;
  }

  const firstSegment = pathname.split('/').find(Boolean);
  return firstSegment === 'en' || firstSegment === 'fr' ? firstSegment : fallbackLang;
}

export default detectUrlLanguage;
