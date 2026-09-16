/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import OriginalLanguagePill from '../OriginalLanguagePill.js';

// Mimics real i18n interpolation for the one key with a {language}
// placeholder; admin.common.aiAnswersSource just needs a real, distinct
// value per language.
const t = (lang) => (key) => {
  const values = {
    en: {
      'admin.common.originallyAskedIn': 'Originally asked in: {language}',
      'admin.common.aiAnswersSource': 'English only',
    },
    fr: {
      'admin.common.originallyAskedIn': 'Posée à l\'origine en : {language}',
      'admin.common.aiAnswersSource': 'En anglais seulement',
    },
  };
  return values[lang][key] ?? key;
};

afterEach(() => cleanup());

// The "English only" companion pill exists because a FR-UI admin might
// otherwise assume French is available somewhere for a non-EN/FR question -
// it never is (official-languages.md Rule 1). Only meaningful on the FR UI;
// an EN-UI admin seeing English content needs no such reminder.
describe('OriginalLanguagePill — English-only companion pill', () => {
  it('shows only the language pill on the English UI, no companion pill', () => {
    render(<OriginalLanguagePill languageCode="ar" lang="en" t={t('en')} />);

    expect(screen.getByText(/Originally asked in/)).toBeTruthy();
    expect(screen.queryByText('English only')).toBeNull();
  });

  it('shows both the language pill and the "English only" companion pill on the French UI', () => {
    render(<OriginalLanguagePill languageCode="ar" lang="fr" t={t('fr')} />);

    expect(screen.getByText(/Posée à l'origine en/)).toBeTruthy();
    expect(screen.getByText('En anglais seulement')).toBeTruthy();
  });

  it('renders nothing at all when there is no language to show', () => {
    const { container } = render(<OriginalLanguagePill languageCode="" lang="fr" t={t('fr')} />);

    expect(container.firstChild).toBeNull();
  });
});
