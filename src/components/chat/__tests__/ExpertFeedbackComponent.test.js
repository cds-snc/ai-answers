/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, render, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mimics real i18n interpolation for the one key this suite depends on
// ({field} substitution), everything else just echoes its key — enough to
// assert on field-specific vs. generic error text without pulling in the
// real locale files.
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key) => key,
  }),
}));

import ExpertFeedbackComponent from '../ExpertFeedbackComponent.js';

afterEach(() => cleanup());

const renderComponent = (props = {}) => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <ExpertFeedbackComponent
      onSubmit={onSubmit}
      onClose={onClose}
      sentenceCount={2}
      sentences={['This is sentence one.', 'This is sentence two.']}
      citationUrl="https://canada.ca/example"
      {...props}
    />
  );
  return { ...utils, onSubmit, onClose };
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'homepage.expertRating.submit' }));

describe('ExpertFeedbackComponent — explanation required on non-good ratings', () => {
  it('submits with no explanation when every rating is "good"', () => {
    const { onSubmit } = renderComponent({ sentenceCount: 1, sentences: ['x'] });

    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.good/)[0]); // sentence "good"
    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.good/)[1]); // citation "good"
    submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('blocks submit and shows an inline error above the field when a rating has no explanation', () => {
    const { onSubmit } = renderComponent({ sentenceCount: 1, sentences: ['x'] });

    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[0]);
    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    const error = screen.getByText((_, node) => node?.className === 'form-error-message font-size-text-sm-nr');
    const textarea = screen.getByRole('textbox');
    // error node must precede the textarea in DOM order (rendered above it)
    expect(error.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('clears the inline error as soon as the explanation is filled in, without a resubmit', () => {
    renderComponent({ sentenceCount: 1, sentences: ['x'] });

    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[0]);
    submit();
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Missed a key detail.' } });

    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBeNull();
  });

  it('submits successfully once the required explanation is provided', () => {
    const { onSubmit } = renderComponent({ sentenceCount: 1, sentences: ['x'] });

    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[0]);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Missed a key detail.' } });
    submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].sentence1Explanation).toBe('Missed a key detail.');
  });

  it('does not require the citation explanation when only a sentence rating is missing one', () => {
    const { onSubmit } = renderComponent({ sentenceCount: 1, sentences: ['x'] });

    // Sentence needs an explanation; citation stays unrated (no explanation required there).
    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.incorrect/)[0]);
    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('hides the "better citation URL" field until the citation is rated needsImprovement/incorrect', () => {
    renderComponent({ sentenceCount: 1, sentences: ['x'] });

    expect(screen.queryByLabelText(/homepage.expertRating.options.betterCitation/)).toBeNull();

    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.incorrect/)[1]); // citation "incorrect"

    expect(screen.getByLabelText(/homepage.expertRating.options.betterCitation/)).toBeTruthy();
  });

  it('does not retroactively flag a field revealed after a failed submit, until it is itself submitted', () => {
    // Regression test: rating sentence 1 blank, failing submit, then rating
    // sentence 2 for the first time used to immediately show sentence 2 as
    // errored too, before the reviewer had any chance to fill it in.
    renderComponent();

    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[0]); // sentence 1
    submit();
    expect(screen.getAllByRole('textbox')).toHaveLength(1); // only sentence 1's box exists so far, and it's errored

    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[1]); // sentence 2

    const textboxes = screen.getAllByRole('textbox');
    expect(textboxes).toHaveLength(2);
    // Sentence 2's box, just revealed, must not be pre-flagged as invalid.
    const sentence2Box = textboxes.find((el) => el.name === 'sentence2Explanation');
    expect(sentence2Box.getAttribute('aria-invalid')).toBeNull();
  });

  it('shows a field name in the message and a jump-link summary only once more than one field is in error', () => {
    renderComponent();

    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[0]); // sentence 1
    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[1]); // sentence 2
    submit();

    // With 2 errors, the field name is shown plainly (not wrapped in the
    // screen-reader-only .sr-only span used for the single-error case).
    const errorMessages = document.querySelectorAll('.form-error-message');
    expect(errorMessages).toHaveLength(2);
    errorMessages.forEach((el) => {
      expect(el.querySelector('.sr-only')).toBeNull();
      expect(el.textContent).toContain('homepage.expertRating.sentence');
    });

    // Hand-rolled summary renders with the two jump links.
    expect(document.querySelector('.explanation-error-summary')).toBeTruthy();
  });

  it('builds jump-links that resolve to the field they point to and jump focus there on click', () => {
    renderComponent();

    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[0]); // sentence 1
    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[1]); // sentence 2
    submit();

    const links = document.querySelectorAll('.explanation-error-summary a');
    expect(links).toHaveLength(2);

    const textboxes = screen.getAllByRole('textbox');
    links.forEach((link, i) => {
      const targetId = link.getAttribute('href').slice(1);
      expect(document.getElementById(targetId)).toBe(textboxes[i]);
    });

    fireEvent.click(links[1]);
    expect(document.activeElement).toBe(textboxes[1]);
  });

  it('focuses the error summary itself (not a field) once more than one field is in error', () => {
    renderComponent();

    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[0]);
    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[1]);
    submit();

    expect(document.activeElement).toBe(document.querySelector('.explanation-error-summary'));
    // Neither textarea should have grabbed focus instead.
    screen.getAllByRole('textbox').forEach((box) => {
      expect(document.activeElement).not.toBe(box);
    });
  });

  it('wraps the field name in a screen-reader-only span when only one field is in error', () => {
    renderComponent({ sentenceCount: 1, sentences: ['x'] });

    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[0]);
    submit();

    const errorMessage = document.querySelector('.form-error-message');
    expect(errorMessage.querySelector('.sr-only')).toBeTruthy();
    expect(errorMessage.querySelector('.sr-only').textContent.trim()).toBe('homepage.expertRating.sentence1');
    expect(document.querySelector('.explanation-error-summary')).toBeNull();
  });
});

// EN/FR-official-languages display rule (shown as-is; non-EN/FR collapses to
// English) (resolveDisplayContent, src/utils/answerLanguage.js) - same rule already
// applied to ExpertFeedbackPanel.js and ChatDashboardPage.js.
describe('ExpertFeedbackComponent — language display', () => {
  it('shows the original sentence untagged for English, no pill', () => {
    renderComponent({
      sentenceCount: 1,
      sentences: ['Can I renew online?'],
      questionLanguage: 'eng',
      sentencesEnglish: ['Can I renew online?'],
    });

    const sentenceText = screen.getByText('Can I renew online?');
    expect(sentenceText.getAttribute('lang')).toBe('en');
    expect(screen.queryByText(/admin.common.originallyAskedIn/)).toBeNull();
  });

  it('shows the original sentence for French, tagged lang="fr" - not the English fallback', () => {
    renderComponent({
      sentenceCount: 1,
      sentences: ['Puis-je renouveler en ligne?'],
      questionLanguage: 'fra',
      sentencesEnglish: ['Can I renew online?'],
    });

    const sentenceText = screen.getByText('Puis-je renouveler en ligne?');
    expect(sentenceText.getAttribute('lang')).toBe('fr');
    expect(screen.queryByText('Can I renew online?')).toBeNull();
  });

  it('collapses a non-EN/FR sentence to the English version, tags lang="en", and shows the pill below the heading', () => {
    renderComponent({
      sentenceCount: 1,
      sentences: ['هل يمكنني التجديد عبر الإنترنت؟'],
      questionLanguage: 'ara',
      sentencesEnglish: ['Can I renew online?'],
    });

    const sentenceText = screen.getByText('Can I renew online?');
    expect(sentenceText.getAttribute('lang')).toBe('en');
    expect(screen.queryByText('هل يمكنني التجديد عبر الإنترنت؟')).toBeNull();

    // The mocked t() just echoes its key, so this asserts presence/position
    // rather than the real interpolated sentence.
    const heading = screen.getByText('homepage.expertRating.intro');
    const pill = screen.getByText(/admin.common.originallyAskedIn/);
    expect(heading.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not show the pill when no language is known at all (legacy data)', () => {
    renderComponent({ sentenceCount: 1, sentences: ['x'] }); // no questionLanguage/sentencesEnglish props

    expect(screen.queryByText(/admin.common.originallyAskedIn/)).toBeNull();
  });
});

describe('ExpertFeedbackComponent — edit mode', () => {
  it('starts from initialFeedback and submits the edited values under the custom label', () => {
    const { onSubmit } = renderComponent({
      sentenceCount: 1,
      sentences: ['x'],
      initialFeedback: { _id: 'ef1', sentence1Score: 80, sentence1Explanation: 'Too vague', citationScore: 25, expertEmail: 'a@b.ca' },
      submitLabel: 'Save changes',
    });

    expect(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[0].checked).toBe(true);
    expect(screen.getByDisplayValue('Too vague')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('Too vague'), { target: { name: 'sentence1Explanation', value: 'Too vague, missing dates' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted).toMatchObject({ sentence1Score: 80, sentence1Explanation: 'Too vague, missing dates', citationScore: 25 });
    // Only form fields are carried over, not the document's other fields.
    expect(submitted).not.toHaveProperty('_id');
    expect(submitted).not.toHaveProperty('expertEmail');
  });

  it('blocks saving an unchanged evaluation, and clears the error once something changes', () => {
    const { onSubmit } = renderComponent({
      sentenceCount: 1,
      sentences: ['x'],
      initialFeedback: { sentence1Score: 100, citationScore: 25 },
      submitLabel: 'Save changes',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('homepage.expertRating.noChangesToSave')).toBeTruthy();

    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[1]); // citation
    expect(screen.queryByText('homepage.expertRating.noChangesToSave')).toBeNull();
  });

  it('does not bring the no-changes error back when a change is undone', () => {
    renderComponent({
      sentenceCount: 1,
      sentences: ['x'],
      initialFeedback: { sentence1Score: 100, citationScore: 25 },
      submitLabel: 'Save changes',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText('homepage.expertRating.noChangesToSave')).toBeTruthy();

    // Change the citation rating, then put it back to its saved value.
    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.needsImprovement/)[1]);
    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.good/)[1]);
    expect(screen.queryByText('homepage.expertRating.noChangesToSave')).toBeNull();
  });

  it('shows the "Editing" pill inside the heading only when editing', () => {
    const { container } = renderComponent({ initialFeedback: { sentence1Score: 100 } });
    const heading = screen.getByRole('heading', { level: 4 });
    expect(heading.textContent).toContain('homepage.expertRating.editingLabel');
    expect(container.querySelector('.expert-rating-container--editing')).not.toBeNull();

    cleanup();
    const { container: fresh } = renderComponent();
    expect(screen.queryByText('homepage.expertRating.editingLabel')).toBeNull();
    expect(fresh.querySelector('.expert-rating-container--editing')).toBeNull();
  });
});

describe('ExpertFeedbackComponent — citation section open state', () => {
  const citationDetails = (container) => container.querySelector('details.citation-details');

  it('starts collapsed for a new evaluation', () => {
    const { container } = renderComponent();
    expect(citationDetails(container).open).toBe(false);
  });

  it('starts open when editing an evaluation whose citation was rated', () => {
    const { container } = renderComponent({ initialFeedback: { citationScore: 0 } });
    expect(citationDetails(container).open).toBe(true);
  });

  it('stays collapsed when editing an evaluation whose citation was not rated', () => {
    const { container } = renderComponent({ initialFeedback: { sentence1Score: 100, citationScore: null } });
    expect(citationDetails(container).open).toBe(false);
  });
});
