// src/config/pageTitle.js
//
// Builds the "<page title> - <site title>" string App.js's title effect
// puts in document.title. Extracted so server/server.js can build the exact
// same string for the initial HTML response (see routeTitleKeys.js) instead
// of a second hand-written copy that can drift from what the client renders.
import { DEFAULT_METADATA } from './metadata.js';

export const buildSiteTitle = (lang) => {
  const langKey = lang === 'fr' ? 'FR' : 'EN';
  return lang === 'fr'
    ? `Bêta : ${DEFAULT_METADATA.TITLE[langKey]}`
    : `Beta: ${DEFAULT_METADATA.TITLE[langKey]}`;
};

// pageTitle: the already-translated page title (e.g. t(titleKey)), or null
// for routes with no titleKey - callers match App.js's own fallback there.
export const buildPageTitle = (pageTitle, lang) => {
  const siteTitle = buildSiteTitle(lang);
  return pageTitle ? `${pageTitle} - ${siteTitle}` : siteTitle;
};
