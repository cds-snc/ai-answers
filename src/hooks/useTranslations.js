// src/hooks/useTranslations.js
import { useCallback } from 'react';
import enTranslations from '../locales/en.json';
import frTranslations from '../locales/fr.json';

export const useTranslations = (lang) => {
  const translations = lang === 'fr' ? frTranslations : enTranslations;

  const t = useCallback(
    (key) => {
      // Split the key by dots to access nested objects
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
    },
    [translations]
  );

  return { t };
};
