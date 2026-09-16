// src/hooks/useTranslations.js
import { useCallback } from 'react';
import { translate } from '../utils/translate.js';

export const useTranslations = (lang) => {
  const t = useCallback((key) => translate(key, lang), [lang]);

  return { t };
};
