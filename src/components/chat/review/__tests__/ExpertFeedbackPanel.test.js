/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpertFeedbackPanel from '../ExpertFeedbackPanel.js';
import FeedbackService from '../../../../services/FeedbackService.js';
import ClientLoggingService from '../../../../services/ClientLoggingService.js';
import { waitForAnnouncement } from '../../../../../test/liveAnnouncer.js';

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
  default: { getExpertFeedback: vi.fn(), deleteExpertFeedback: vi.fn(), setExpertNeverStale: vi.fn(), updateExpertFeedback: vi.fn() },
}));
vi.mock('../../../../services/ClientLoggingService.js', () => ({
  default: { info: vi.fn() },
}));
vi.mock('../../../../hooks/useTranslations.js', () => ({ useTranslations: () => ({ t: (key) => key }) }));
vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: React.forwardRef(({ children, onClick, disabled }, ref) => (
    <button ref={ref} onClick={onClick} disabled={disabled}>{children}</button>
  )),
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsIcon: () => null,
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

describe('ExpertFeedbackPanel edit', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete ownedFeedback.lastEditedBy;
    delete ownedFeedback.lastEditedAt;
  });

  const ownedFeedback = { ...expertFeedback, expertEmail: 'Author@canada.ca', citationScore: 25 };
  // canEdit comes from the server (api/util/expert-feedback-access.js).
  const renderOpen = ({ canEdit = true, ...props } = {}) => {
    const message = buildMessage({ language: 'eng', redactedQuestion: 'Q?', englishQuestion: 'Q?' });
    message.interaction.expertFeedback = ownedFeedback;
    vi.mocked(FeedbackService.getExpertFeedback).mockResolvedValue({ expertFeedback: ownedFeedback, sentences: [], canEdit });
    const utils = render(<ExpertFeedbackPanel message={message} extractSentences={extractSentences} t={mockT} lang="en" {...props} />);
    fireEvent.click(utils.container.querySelector('summary'));
    return utils;
  };
  const findEditButton = () => screen.findByRole('button', { name: 'reviewPanels.editExpertFeedback' });
  const saveButton = () => screen.getByRole('button', { name: /reviewPanels.saveExpertFeedback|reviewPanels.savingExpertFeedback/ });
  const changeSentenceOne = () => {
    fireEvent.click(screen.getAllByLabelText(/homepage.expertRating.options.incorrect/)[0]);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { name: 'sentence1Explanation', value: 'Wrong program' } });
  };

  it('shows Edit when the server says this person can edit', async () => {
    renderOpen({ canEdit: true });
    expect(await findEditButton()).toBeTruthy();
  });

  it('hides Edit when the server says this person cannot edit', async () => {
    renderOpen({ canEdit: false });
    await screen.findByText(/reviewPanels.deleteExpertFeedback/);
    expect(screen.queryByRole('button', { name: 'reviewPanels.editExpertFeedback' })).toBeNull();
  });

  it('hides Edit until the evaluation has loaded, so the form never starts from the older copy', async () => {
    let resolveLoad;
    const message = buildMessage({ language: 'eng', redactedQuestion: 'Q?', englishQuestion: 'Q?' });
    message.interaction.expertFeedback = ownedFeedback;
    vi.mocked(FeedbackService.getExpertFeedback).mockReturnValue(new Promise((r) => { resolveLoad = r; }));
    const { container } = render(<ExpertFeedbackPanel message={message} extractSentences={extractSentences} t={mockT} lang="en" />);
    fireEvent.click(container.querySelector('summary'));

    await screen.findByText(/reviewPanels.deleteExpertFeedback/);
    expect(screen.queryByRole('button', { name: 'reviewPanels.editExpertFeedback' })).toBeNull();
    resolveLoad({ expertFeedback: ownedFeedback, sentences: [], canEdit: true });
    expect(await findEditButton()).toBeTruthy();
  });

  it('moves focus to the form heading on Edit, and back to Edit on Cancel editing', async () => {
    renderOpen();
    fireEvent.click(await findEditButton());
    expect(document.activeElement.textContent).toContain('homepage.expertRating.intro');

    fireEvent.click(screen.getByRole('button', { name: 'reviewPanels.cancelExpertFeedbackEdits' }));
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(FeedbackService.updateExpertFeedback).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'reviewPanels.editExpertFeedback' })));
  });

  it('saves, hands the result up, returns focus to Edit and announces the update', async () => {
    const saved = { ...ownedFeedback, sentence1Score: 0, sentence1Explanation: 'Wrong program', lastEditedBy: 'qa@canada.ca' };
    vi.mocked(FeedbackService.updateExpertFeedback).mockResolvedValue({ expertFeedback: saved });
    const onUpdated = vi.fn();
    renderOpen({ onUpdated });

    fireEvent.click(await findEditButton());
    expect(screen.queryByRole('table')).toBeNull();
    changeSentenceOne();
    fireEvent.click(saveButton());

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(saved));
    expect(vi.mocked(FeedbackService.updateExpertFeedback).mock.calls[0][0]).toMatchObject({
      interactionId: 'int1',
      expertFeedbackId: ownedFeedback._id,
      expectedLastEditedAt: null,
      expertFeedback: { sentence1Score: 0, sentence1Explanation: 'Wrong program', sentence2Score: 100, citationScore: 25 },
    });
    expect(await screen.findByRole('table')).toBeTruthy();
    // No second request after the save - nothing that could fail after it worked.
    expect(FeedbackService.getExpertFeedback).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'reviewPanels.editExpertFeedback' })));
    await waitForAnnouncement('reviewPanels.expertFeedbackUpdated');
  });

  it('shows Saving… and ignores a second press while the save is in flight', async () => {
    let resolveSave;
    vi.mocked(FeedbackService.updateExpertFeedback).mockReturnValue(new Promise((r) => { resolveSave = r; }));
    renderOpen();

    fireEvent.click(await findEditButton());
    changeSentenceOne();
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveButton().textContent).toContain('reviewPanels.savingExpertFeedback'));
    expect(saveButton().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(saveButton());

    expect(FeedbackService.updateExpertFeedback).toHaveBeenCalledTimes(1);
    resolveSave({ expertFeedback: ownedFeedback });
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it('does not report a failed save when only the log entry afterwards fails', async () => {
    vi.mocked(FeedbackService.updateExpertFeedback).mockResolvedValue({ expertFeedback: ownedFeedback });
    vi.mocked(ClientLoggingService.info).mockRejectedValueOnce(new Error('log down'));
    renderOpen();

    fireEvent.click(await findEditButton());
    changeSentenceOne();
    fireEvent.click(saveButton());

    expect(await screen.findByText('reviewPanels.expertFeedbackUpdated')).toBeTruthy();
    expect(screen.queryByText('log down')).toBeNull();
  });

  it('shows the edit time only, when the expert edited their own evaluation', async () => {
    ownedFeedback.lastEditedBy = 'author@canada.ca';
    ownedFeedback.lastEditedAt = '2026-10-07T15:40:00Z';
    renderOpen();
    const label = await screen.findByText('reviewPanels.lastEdited');
    expect(label.parentElement.textContent).not.toContain('reviewPanels.lastEditedDateBy');
    expect(label.parentElement.textContent).toContain('2026');
  });

  it('adds the editor email when someone else edited it', async () => {
    ownedFeedback.lastEditedBy = 'qa@canada.ca';
    ownedFeedback.lastEditedAt = '2026-10-07T15:40:00Z';
    renderOpen();
    const label = await screen.findByText('reviewPanels.lastEdited');
    expect(label.parentElement.textContent).toContain('reviewPanels.lastEditedDateBy');
  });

  it('shows a translated save failure under the Save button, logs the detail, and keeps the form open', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(FeedbackService.updateExpertFeedback).mockRejectedValue(new Error('Boom'));
    renderOpen();

    fireEvent.click(await findEditButton());
    changeSentenceOne();
    fireEvent.click(saveButton());

    const errorText = await screen.findByText('reviewPanels.expertFeedbackSaveFailed');
    expect(saveButton().compareDocumentPosition(errorText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(saveButton().textContent).toContain('reviewPanels.saveExpertFeedback');
    // The raw detail goes to the console, never on screen.
    expect(screen.queryByText(/Boom/)).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'Boom' }));
  });

  it('shows its own message, not "try again", when someone else edited it meanwhile', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const conflict = Object.assign(new Error('Expert feedback was edited elsewhere'), { code: 'EXPERT_FEEDBACK_CONFLICT' });
    vi.mocked(FeedbackService.updateExpertFeedback).mockRejectedValue(conflict);
    renderOpen();

    fireEvent.click(await findEditButton());
    changeSentenceOne();
    fireEvent.click(saveButton());

    await waitForAnnouncement('reviewPanels.expertFeedbackEditConflict', 'assertive');
    expect(screen.queryByText('reviewPanels.expertFeedbackSaveFailed')).toBeNull();
  });

  it('confirms Never stale under the checkbox, worded for on and off', async () => {
    vi.mocked(FeedbackService.setExpertNeverStale).mockResolvedValue({});
    renderOpen();
    const checkbox = await screen.findByRole('checkbox', { name: 'reviewPanels.neverStale' });

    fireEvent.click(checkbox);
    await waitForAnnouncement('reviewPanels.neverStaleOn');
    fireEvent.click(checkbox);
    await waitForAnnouncement('reviewPanels.neverStaleOff');
    expect(screen.queryByText('reviewPanels.neverStaleOn')).toBeNull();
  });

  it('puts the box back and shows a translated failure when Never stale fails to save', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(FeedbackService.setExpertNeverStale).mockRejectedValue(new Error('Boom'));
    renderOpen();
    const checkbox = await screen.findByRole('checkbox', { name: 'reviewPanels.neverStale' });

    fireEvent.click(checkbox);
    await waitForAnnouncement('reviewPanels.neverStaleFailed', 'assertive');
    expect(checkbox.checked).toBe(false);
    expect(screen.queryByText(/Boom/)).toBeNull();
    expect(screen.queryByText('reviewPanels.neverStaleOn')).toBeNull();
  });

  it('still confirms Never stale when only the log entry afterwards fails', async () => {
    vi.mocked(FeedbackService.setExpertNeverStale).mockResolvedValue({});
    vi.mocked(ClientLoggingService.info).mockRejectedValueOnce(new Error('log down'));
    renderOpen();
    const checkbox = await screen.findByRole('checkbox', { name: 'reviewPanels.neverStale' });

    fireEvent.click(checkbox);
    expect(await screen.findByText('reviewPanels.neverStaleOn')).toBeTruthy();
    expect(checkbox.checked).toBe(true);
  });

  it('keeps Never stale enabled while its save is in flight, and ignores a second toggle', async () => {
    let resolveToggle;
    vi.mocked(FeedbackService.setExpertNeverStale).mockReturnValue(new Promise((r) => { resolveToggle = r; }));
    renderOpen();

    const checkbox = await screen.findByRole('checkbox', { name: 'reviewPanels.neverStale' });
    checkbox.focus();
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);

    // Not disabled, so keyboard focus stays on it.
    expect(checkbox.disabled).toBe(false);
    expect(document.activeElement).toBe(checkbox);
    expect(FeedbackService.setExpertNeverStale).toHaveBeenCalledTimes(1);
    resolveToggle({});
    await waitFor(() => expect(ClientLoggingService.info).toHaveBeenCalled());
  });
});
