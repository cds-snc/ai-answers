// src/hooks/useTranslations.js
import { useCallback } from 'react';
import enTranslations from '../locales/en.json';
import frTranslations from '../locales/fr.json';

// Looks up a key against an explicit language, independent of any component's ambient `lang`.
// Used where a single string needs to render in a language other than the page's own (see
// resolveChromeLang in src/utils/answerLanguage.js).
export const translate = (key, lang) => {
  const translations = lang === 'fr' ? frTranslations : enTranslations;
  const keys = key.split('.');
  let value = translations;

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      console.warn(`Translation missing for key: ${key}`);
      return key;
    }
  }

  return value || key;
};

export const useTranslations = (lang) => {
  const t = useCallback((key) => translate(key, lang), [lang]);

  return { t };
};
