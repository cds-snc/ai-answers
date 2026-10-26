// src/utils/translate.js
//
// Pure locale-key lookup, split out of useTranslations.js so server-side code
// (server/server.js, for the initial-HTML <title>/meta tags on a real page
// load) can resolve the exact same strings React does on the client, instead
// of a second hand-written copy of this logic that can drift from it.
// `with { type: 'json' }`: required for this file to load under plain
// node (server.js's runtime, pinned to node 24 in package.json#engines) -
// without it, node's ESM loader rejects a bare JSON import. Vite and Vitest
// both already handle plain JSON imports natively and accept this attribute
// too, so it's safe for the client bundle and tests as well.
import enTranslations from '../locales/en.json' with { type: 'json' };
import frTranslations from '../locales/fr.json' with { type: 'json' };

export const getTranslationsForLang = (lang) => (lang === 'fr' ? frTranslations : enTranslations);

export const translate = (key, lang) => {
  const translations = getTranslationsForLang(lang);
  // Split the key by dots to access nested objects
  const keys = key.split('.');
  let value = translations;

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      // %s placeholder, not string interpolation - console.warn's first
      // argument is a format string, and this is reachable server-side too now.
      console.warn('Translation missing for key: %s', key);
      return key;
    }
  }

  return value || key;
};
