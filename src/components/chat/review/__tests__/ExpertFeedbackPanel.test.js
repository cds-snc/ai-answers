/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpertFeedbackPanel from '../ExpertFeedbackPanel.js';
import FeedbackService from '../../../../services/FeedbackService.js';

// EN/FR-official-languages display rule (shown as-is; non-EN/FR collapses to
// English) - see answerLanguage.js's resolveDisplayContent. Proves the
// wiring end-to-end (real component, real DOM), not just the resolver
// function in isolation.

const TRANSLATIONS = {
  'reviewPanels.question': 'Question:',
  'reviewPanels.sentence': 'Sentence',
  'reviewPanels.sourceText': 'Source text',
  'reviewPanels.notAvailable': 'N/A',
  'admin.common.originallyAskedIn': 'Originally asked in: {language}',
};
const mockT = (key) => TRANSLATIONS[key] || key;

vi.mock('../../../../services/FeedbackService.js', () => ({
  default: { getExpertFeedback: vi.fn(), deleteExpertFeedback: vi.fn(), setExpertNeverStale: vi.fn() },
}));
vi.mock('../../../../services/ClientLoggingService.js', () => ({
  default: { info: vi.fn() },
}));
vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
}));

const answer = {
  sentences: ['Original sentence one.', 'Original sentence two.'],
  sentencesEnglish: ['English sentence one.', 'English sentence two.'],
};
const expertFeedback = { _id: 'ef1', totalScore: 100, sentence1Score: 100, sentence2Score: 100 };
const extractSentences = (text) => [text];

const buildMessage = ({ language, redactedQuestion, englishQuestion }) => ({
  id: 'msg1',
  interaction: {
    _id: 'int1',
    question: { language, redactedQuestion, englishQuestion },
    answer,
    expertFeedback,
  },
});

describe('ExpertFeedbackPanel language display', () => {
  afterEach(() => cleanup());

  it('shows the original English question and sentences untranslated, no pill', () => {
    const message = buildMessage({
      language: 'eng',
      redactedQuestion: 'Can I renew online?',
      englishQuestion: 'Can I renew online?',
    });

    render(<ExpertFeedbackPanel message={message} extractSentences={extractSentences} t={mockT} lang="en" />);

    const questionText = screen.getByText('Can I renew online?');
    expect(questionText.getAttribute('lang')).toBe('en');
    expect(screen.getByText('Sentence')).toBeTruthy();
    expect(screen.queryByText('Source text')).toBeNull();
    expect(screen.getByText('Original sentence one.').closest('td').getAttribute('lang')).toBe('en');
    expect(screen.queryByText(/Originally asked in/)).toBeNull();
  });

  it('shows the original French question and sentences untranslated, tagged lang="fr" - not collapsed to English', () => {
    const message = buildMessage({
      language: 'fra',
      redactedQuestion: 'Puis-je renouveler en ligne?',
      // Still translated internally for the AI service, per the signed-off
      // rule - display must ignore this and show the French original.
      englishQuestion: 'Can I renew online?',
    });

    render(<ExpertFeedbackPanel message={message} extractSentences={extractSentences} t={mockT} lang="fr" />);

    const questionText = screen.getByText('Puis-je renouveler en ligne?');
    expect(questionText.getAttribute('lang')).toBe('fr');
    expect(screen.queryByText('Can I renew online?')).toBeNull();
    expect(screen.getByText('Sentence')).toBeTruthy();
    expect(screen.queryByText('Source text')).toBeNull();
    expect(screen.getByText('Original sentence one.').closest('td').getAttribute('lang')).toBe('fr');
    expect(screen.queryByText(/Originally asked in/)).toBeNull();
  });

  it('collapses a non-EN/FR question to the English version, tags lang="en", and shows the pill', () => {
    const message = buildMessage({
      language: 'ara',
      redactedQuestion: 'هل يمكنني التجديد عبر الإنترنت؟',
      englishQuestion: 'Can I renew online?',
    });

    render(<ExpertFeedbackPanel message={message} extractSentences={extractSentences} t={mockT} lang="en" />);

    const questionText = screen.getByText('Can I renew online?');
    expect(questionText.getAttribute('lang')).toBe('en');
    expect(screen.queryByText('هل يمكنني التجديد عبر الإنترنت؟')).toBeNull();
    expect(screen.getByText('Source text')).toBeTruthy();
    expect(screen.queryByText('Sentence', { selector: 'th' })).toBeNull();
    expect(screen.getByText('English sentence one.').closest('td').getAttribute('lang')).toBe('en');
    expect(screen.queryByText('Original sentence one.')).toBeNull();
    expect(screen.getByText('Originally asked in: Arabic')).toBeTruthy();
  });

  // Regression: interaction.question isn't always a populated Question
  // document (models/question.js) - some code paths only carry an id
  // reference, or omit it entirely. questionLanguage/originalQuestion used
  // to derive purely from interaction.question, so an unpopulated question
  // meant questionLanguage stayed '' - which resolveDisplayContent treats
  // as "already EN/FR, show as-is" - silently hiding the whole Question
  // block AND showing the untranslated original-language sentences below
  // instead of falling back to English, even though answer.englishQuestion
  // and answer.questionLanguage (independent of interaction.question) were
  // both available the whole time.
  it('still shows the question and falls back to English sentences when interaction.question is not a populated object', () => {
    const message = {
      id: 'msg1',
      interaction: {
        _id: 'int1',
        // No `question` field at all - not populated, matching a real API
        // shape gap rather than the exact "string/id" case, since a raw id
        // string would itself get picked up as a (meaningless) englishQuestion
        // fallback value by this component's own rawQuestion chain.
        answer: {
          ...answer,
          questionLanguage: 'ara',
          englishQuestion: 'Can I renew online?',
        },
        expertFeedback,
      },
    };

    render(<ExpertFeedbackPanel message={message} extractSentences={extractSentences} t={mockT} lang="en" />);

    const questionText = screen.getByText('Can I renew online?');
    expect(questionText.getAttribute('lang')).toBe('en');
    expect(screen.getByText('Source text')).toBeTruthy();
    expect(screen.getByText('English sentence one.').closest('td').getAttribute('lang')).toBe('en');
    expect(screen.queryByText('Original sentence one.')).toBeNull();
  });

  // Regression: the per-sentence "expert score" column used to render a
  // hardcoded literal 'N/A' string, bypassing t() entirely, when a sentence
  // had no score set - so it stayed in English even on the French UI. It's
  // now t('reviewPanels.notAvailable'), matching the rest of this table's
  // N/A cells. A distinct sentinel value (not literally 'N/A') proves the
  // cell actually goes through t() rather than falling back to the literal.
  it('renders the missing-score cell through t(), not a hardcoded literal', () => {
    const sentinelT = (key) => (key === 'reviewPanels.notAvailable' ? 'SENTINEL-NOT-AVAILABLE' : TRANSLATIONS[key] || key);
    const message = buildMessage({
      language: 'eng',
      redactedQuestion: 'Can I renew online?',
      englishQuestion: 'Can I renew online?',
    });
    // No sentence1Score/sentence2Score on this expertFeedback at all.
    message.interaction.expertFeedback = { _id: 'ef2', totalScore: 100 };

    render(<ExpertFeedbackPanel message={message} extractSentences={extractSentences} t={sentinelT} lang="fr" />);

    expect(screen.getAllByText('SENTINEL-NOT-AVAILABLE').length).toBeGreaterThan(0);
    expect(screen.queryByText('N/A')).toBeNull();
  });
});

// Regression: deleting an eval used to only mutate the shared `message`
// object in place (message.interaction.expertFeedback = undefined) - React
// never learns that happened, so ChatInterface.js's own
// `!message.interaction.expertFeedback` check (deciding whether to show the
// eval form again) kept evaluating against its last render and the form
// stayed hidden until a full page refresh. onDeleted is how this panel now
// tells the actual owner of `messages` state that the eval is gone.
describe('ExpertFeedbackPanel delete', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('calls onDeleted after a successful delete, so the parent can update messages state immediately', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(FeedbackService.deleteExpertFeedback).mockResolvedValue({});
    const onDeleted = vi.fn();
    const message = buildMessage({
      language: 'eng',
      redactedQuestion: 'Can I renew online?',
      englishQuestion: 'Can I renew online?',
    });

    const { container } = render(<ExpertFeedbackPanel message={message} extractSentences={extractSentences} t={mockT} lang="en" onDeleted={onDeleted} />);

    // Open the panel (delete button lives inside the <details>). Scoped to
    // the actual <summary> - a plain text match would also catch the
    // table's sr-only <caption>, which reuses the same title text.
    fireEvent.click(container.querySelector('summary'));

    const deleteButton = await screen.findByText(/Delete Expert Feedback|reviewPanels.deleteExpertFeedback/);
    fireEvent.click(deleteButton);

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });
});
