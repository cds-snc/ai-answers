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
    // screen-reader-only .wb-inv span used for the single-error case).
    const errorMessages = document.querySelectorAll('.form-error-message');
    expect(errorMessages).toHaveLength(2);
    errorMessages.forEach((el) => {
      expect(el.querySelector('.wb-inv')).toBeNull();
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
    expect(errorMessage.querySelector('.wb-inv')).toBeTruthy();
    expect(errorMessage.querySelector('.wb-inv').textContent.trim()).toBe('homepage.expertRating.sentence1');
    expect(document.querySelector('.explanation-error-summary')).toBeNull();
  });
});
