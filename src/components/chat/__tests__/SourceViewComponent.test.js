/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import SourceViewComponent from '../SourceViewComponent.js';

const TRANSLATIONS = {
  'homepage.expertRating.sourceView.title': "AI Answers' source text",
  'reviewPanels.question': 'Question:',
  'homepage.feedback.question': 'How was this answer?',
  'homepage.feedback.useful': 'Good',
  'homepage.feedback.notUseful': 'Needs improvement',
  'admin.common.originallyAskedIn': 'Originally asked in: {language}',
};
const mockT = (key) => TRANSLATIONS[key] || key;

vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

describe('SourceViewComponent', () => {
  afterEach(cleanup);

  // Regression: the popout's own container is tagged lang={lang} - the
  // reviewer's own UI language, e.g. "fr" for a French-interface admin -
  // but englishQuestion is guaranteed-English text (the whole point of this
  // popout). Without its own lang="en" wrapper it silently inherits the
  // surrounding "fr" and gets mispronounced by a screen reader, unlike every
  // answer sentence rendered right below it, which already gets its own
  // per-item lang tag.
  it('tags englishQuestion lang="en" even when the popout itself is in French', () => {
    render(
      <SourceViewComponent
        lang="fr"
        sentenceCount={1}
        sentences={['Original sentence.']}
        questionLanguage="ara"
        sentencesEnglish={['English sentence.']}
        englishQuestion="What is the English question?"
      />
    );

    const questionText = screen.getByText('What is the English question?');
    expect(questionText.tagName).toBe('SPAN');
    expect(questionText.getAttribute('lang')).toBe('en');

    // The container itself still carries the reviewer's own UI language.
    expect(questionText.closest('.expert-rating-container').getAttribute('lang')).toBe('fr');
  });

  it('does not render the question block at all when englishQuestion is empty', () => {
    render(
      <SourceViewComponent
        lang="fr"
        sentenceCount={1}
        sentences={['Original sentence.']}
        questionLanguage="ara"
        sentencesEnglish={['English sentence.']}
        englishQuestion=""
      />
    );

    expect(screen.queryByText('Question:')).toBeNull();
  });
});
