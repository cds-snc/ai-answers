/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, render, fireEvent, screen, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key) => key,
  }),
}));

const mockUseHasAnyRole = vi.fn();
vi.mock('../../RoleBasedUI.js', () => ({
  useHasAnyRole: (...args) => mockUseHasAnyRole(...args),
}));

const mockPersistExpertFeedback = vi.fn();
vi.mock('../../../services/FeedbackService.js', () => ({
  default: {
    persistExpertFeedback: (...args) => mockPersistExpertFeedback(...args),
    persistPublicFeedback: vi.fn(),
  },
}));

import FeedbackComponent from '../FeedbackComponent.js';

afterEach(() => {
  cleanup();
  mockPersistExpertFeedback.mockClear();
});

const renderComponent = (props = {}) => {
  return render(
    <FeedbackComponent
      chatId="chat-1"
      userMessageId="msg-1"
      sentenceCount={1}
      sentences={['x']}
      {...props}
    />
  );
};

const sourceProps = {
  sentences: ['هل يمكنني التجديد عبر الإنترنت؟'],
  questionLanguage: 'ara',
  sentencesEnglish: ['Can I renew online?'],
};

// "Review the English source text" reuses ExpertFeedbackComponent's
// sentence-display flow (resolveDisplayContent, src/utils/answerLanguage.js)
// but with no detailed rating UI - just the sentences, plus a simple
// Good/Needs improvement choice at the bottom. Shown in place of direct
// Good/Needs improvement on the expert "How was this answer?" prompt
// (homepage.feedback.question) whenever the answer isn't already EN/FR - a
// reviewer can't meaningfully rate what they can't read without seeing AI
// Answers' own English source/working text first. This is not a translation
// service - the popout shows what AI Answers actually worked from, not a
// translation of anything.
describe('FeedbackComponent — source text view', () => {
  it('shows Good/Needs improvement directly for an expert reviewer when the answer is already EN/FR, no source-text link', () => {
    mockUseHasAnyRole.mockReturnValue(true);
    renderComponent({
      sentences: ['Can I renew online?'],
      questionLanguage: 'eng',
      sentencesEnglish: ['Can I renew online?'],
    });

    expect(screen.getByText('homepage.feedback.useful')).toBeTruthy();
    expect(screen.getByText('homepage.feedback.notUseful')).toBeTruthy();
    expect(screen.queryByText('homepage.feedback.viewSource')).toBeNull();
  });

  it('shows only "Review the English source text" (no direct Good/Needs improvement) for an expert reviewer when the answer needed AI Answers\' own English source text', () => {
    mockUseHasAnyRole.mockReturnValue(true);
    renderComponent(sourceProps);

    expect(screen.getByText('homepage.feedback.viewSource')).toBeTruthy();
    expect(screen.queryByText('homepage.feedback.useful')).toBeNull();
    expect(screen.queryByText('homepage.feedback.notUseful')).toBeNull();
  });

  it('opens a sentence view with a simple Good/Needs improvement choice but no detailed rating form', () => {
    mockUseHasAnyRole.mockReturnValue(true);
    renderComponent(sourceProps);

    fireEvent.click(screen.getByText('homepage.feedback.viewSource'));

    // The English fallback sentence is shown, tagged lang="en" ...
    const sentenceText = screen.getByText('Can I renew online?');
    expect(sentenceText.getAttribute('lang')).toBe('en');
    // ... a plain Good/Needs improvement choice is offered ...
    expect(screen.getByText('homepage.feedback.useful')).toBeTruthy();
    expect(screen.getByText('homepage.feedback.notUseful')).toBeTruthy();
    // ... but none of ExpertFeedbackComponent's detailed rating UI (radios,
    // explanation textarea, submit) renders - that's a separate, later step.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'homepage.expertRating.submit' })).toBeNull();
  });

  it('persists positive expert feedback and shows the thank-you message when "Good" is chosen from inside the source-text view', () => {
    mockUseHasAnyRole.mockReturnValue(true);
    renderComponent(sourceProps);

    fireEvent.click(screen.getByText('homepage.feedback.viewSource'));
    fireEvent.click(screen.getByText('homepage.feedback.useful'));

    expect(mockPersistExpertFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        expertFeedback: expect.objectContaining({ feedback: 'positive', totalScore: 100 }),
      })
    );
    expect(screen.getByText('homepage.feedback.thankYou')).toBeTruthy();
  });

  it('opens the full detailed rating form when "Needs improvement" is chosen from inside the source-text view', () => {
    mockUseHasAnyRole.mockReturnValue(true);
    renderComponent(sourceProps);

    fireEvent.click(screen.getByText('homepage.feedback.viewSource'));
    fireEvent.click(screen.getByText('homepage.feedback.notUseful'));

    // The source-text-only view is gone, replaced by ExpertFeedbackComponent's
    // real rating form (radios present, submit button present).
    expect(screen.queryAllByRole('radio').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'homepage.expertRating.submit' })).toBeTruthy();
  });

  it('never shows "Review the English source text" for a public (non-expert) reviewer, even when the answer needed it', () => {
    mockUseHasAnyRole.mockReturnValue(false);
    renderComponent(sourceProps);

    expect(screen.queryByText('homepage.feedback.viewSource')).toBeNull();
  });
});

// Regression: after submitting an expert eval, this component used to show
// "Thank you" and stay that way forever - onSubmit only persisted to the
// server, it never told the parent (ChatAppContainer.js's `messages` state)
// that expertFeedback changed, so ChatInterface.js's
// `!message.interaction.expertFeedback` check never flipped and
// ExpertFeedbackPanel's summary never appeared without a full page reload.
describe('FeedbackComponent — expert eval submit hands off on next click', () => {
  it('does not call onExpertFeedbackChange immediately after a quick "Good" submit', () => {
    mockUseHasAnyRole.mockReturnValue(true);
    const onExpertFeedbackChange = vi.fn();
    renderComponent({
      sentences: ['Can I renew online?'],
      questionLanguage: 'eng',
      sentencesEnglish: ['Can I renew online?'],
      onExpertFeedbackChange,
    });

    fireEvent.click(screen.getByText('homepage.feedback.useful'));

    expect(screen.getByText('homepage.feedback.thankYou')).toBeTruthy();
    expect(onExpertFeedbackChange).not.toHaveBeenCalled();
  });

  it('calls onExpertFeedbackChange with the persisted feedback on the next click anywhere, no timer wait needed', async () => {
    mockUseHasAnyRole.mockReturnValue(true);
    const onExpertFeedbackChange = vi.fn();
    renderComponent({
      sentences: ['Can I renew online?'],
      questionLanguage: 'eng',
      sentencesEnglish: ['Can I renew online?'],
      onExpertFeedbackChange,
    });

    fireEvent.click(screen.getByText('homepage.feedback.useful'));
    // Listener attachment is deferred one tick (setTimeout(0)) so it doesn't
    // also catch this same click while it's still bubbling to document.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    fireEvent.click(document.body);

    expect(onExpertFeedbackChange).toHaveBeenCalledWith(
      expect.objectContaining({ feedback: 'positive', totalScore: 100, type: 'expert' })
    );
  });
});
