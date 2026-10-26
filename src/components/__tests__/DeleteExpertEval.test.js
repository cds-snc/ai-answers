/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DeleteExpertEval from '../DeleteExpertEval.js';

const TRANSLATIONS = {
  'admin.deleteExpertEval.title': 'Delete an expert evaluation',
  'admin.deleteExpertEval.idLabel': 'Chat ID',
  'admin.deleteExpertEval.button': 'Find expert evaluations to delete',
  'admin.deleteExpertEval.notEvaluated': 'Not evaluated.',
  'admin.deleteExpertEval.pickerLegend': 'Choose evaluations to delete',
  'admin.deleteExpertEval.rowLabel': 'Answer {number}, {department}, reviewed by {email}',
  'admin.deleteExpertEval.noDepartment': 'no department',
  'admin.deleteExpertEval.unknownReviewer': 'unknown reviewer',
  'admin.deleteExpertEval.deleteSelected': 'Delete selected evaluations ({count})',
  'admin.deleteExpertEval.noneSelected': 'Choose at least one evaluation to delete.',
  'admin.deleteExpertEval.success': 'Deleted {count} expert evaluation(s) for {chatId}.',
  'admin.deleteExpertEval.failed': 'Could not delete the expert evaluation(s). Try again.',
  'admin.deleteExpertEval.partial': 'Deleted {count} of {total} expert evaluations. The rest could not be deleted and are still listed.',
  'common.deleting': 'Deleting...',
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockDeleteExpertFeedback, mockGetChat } = vi.hoisted(() => ({
  mockDeleteExpertFeedback: vi.fn(),
  mockGetChat: vi.fn(),
}));
vi.mock('../../services/FeedbackService.js', () => ({
  default: { deleteExpertFeedback: mockDeleteExpertFeedback },
}));
vi.mock('../../services/DataStoreService.js', () => ({
  default: { getChat: mockGetChat },
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, onClick, disabled, type }) => (
    <button type={type} onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

// Matches isValidChatIdFormat's uuidv4 pattern.
const VALID_CHAT_ID = 'abcdef12-3456-4789-8abc-def012345678';

// Three questions: 1 and 3 reviewed by different experts in different
// departments, 2 not reviewed.
const chatWithEvaluations = () => mockGetChat.mockResolvedValue({
  chat: {
    chatId: VALID_CHAT_ID,
    interactions: [
      { _id: 'int1', context: { department: 'CRA-ARC' }, expertFeedback: { _id: 'ef1', expertEmail: 'a@example.ca' } },
      { _id: 'int2', context: { department: 'ESDC-EDSC' } },
      { _id: 'int3', context: { department: 'IRCC' }, expertFeedback: { _id: 'ef3', expertEmail: 'b@example.ca' } },
    ],
  },
});

const ROW1 = 'Answer 1, CRA-ARC, reviewed by a@example.ca';
const ROW3 = 'Answer 3, IRCC, reviewed by b@example.ca';

// Same event the browser fires when the summary is clicked.
const toggleSection = () => fireEvent(document.querySelector('details'), new Event('toggle'));

const lookup = (chatId = VALID_CHAT_ID) => {
  fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: chatId } });
  fireEvent.click(screen.getByText('Find expert evaluations to delete'));
};

// Second question unreviewed, so only one evaluation in the chat.
const chatWithOneEvaluation = () => mockGetChat.mockResolvedValue({
  chat: {
    chatId: VALID_CHAT_ID,
    interactions: [
      { _id: 'int1' },
      { _id: 'int2', context: { department: 'CRA-ARC' }, expertFeedback: { _id: 'ef2', expertEmail: 'a@example.ca' } },
    ],
  },
});

describe('DeleteExpertEval with one evaluation', () => {
  afterEach(() => {
    cleanup();
    mockDeleteExpertFeedback.mockReset();
    mockGetChat.mockReset();
    vi.restoreAllMocks();
  });

  it('still lists it, unticked, and deletes once ticked, with no confirm dialog', async () => {
    chatWithOneEvaluation();
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockDeleteExpertFeedback.mockResolvedValue({ deletedCount: 1 });
    render(<DeleteExpertEval lang="en" />);
    lookup();

    const row = await screen.findByLabelText('Answer 2, CRA-ARC, reviewed by a@example.ca');
    expect(row.checked).toBe(false);
    expect(mockDeleteExpertFeedback).not.toHaveBeenCalled();

    fireEvent.click(row);
    fireEvent.click(screen.getByText('Delete selected evaluations (1)'));

    expect(await screen.findByText(`Deleted 1 expert evaluation(s) for ${VALID_CHAT_ID}.`)).toBeTruthy();
    expect(mockDeleteExpertFeedback).toHaveBeenCalledWith({ interactionId: 'int2' });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Chat ID').value).toBe('');
  });

  it('reports a failed delete as a translated error, not raw exception text, and keeps the row', async () => {
    chatWithOneEvaluation();
    mockDeleteExpertFeedback.mockRejectedValue(new Error('Failed to fetch'));
    render(<DeleteExpertEval lang="en" />);
    lookup();

    fireEvent.click(await screen.findByLabelText('Answer 2, CRA-ARC, reviewed by a@example.ca'));
    fireEvent.click(screen.getByText('Delete selected evaluations (1)'));

    const message = await screen.findByText('Could not delete the expert evaluation(s). Try again.');
    expect(message.closest('.status-message--error-box')).not.toBeNull();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(screen.getByLabelText('Answer 2, CRA-ARC, reviewed by a@example.ca')).toBeTruthy();
  });
});

describe('DeleteExpertEval picker (several evaluations)', () => {
  afterEach(() => {
    cleanup();
    mockDeleteExpertFeedback.mockReset();
    mockGetChat.mockReset();
    vi.restoreAllMocks();
  });

  it('lists one unticked row per evaluated answer, with answer number, department and reviewer', async () => {
    chatWithEvaluations();
    render(<DeleteExpertEval lang="en" />);
    lookup();

    const row1 = await screen.findByLabelText(ROW1);
    const row3 = screen.getByLabelText(ROW3);
    expect(row1.checked).toBe(false);
    expect(row3.checked).toBe(false);
    expect(screen.queryByText(/Answer 2/)).toBeNull();
    expect(screen.getByRole('group', { name: 'Choose evaluations to delete' })).toBeTruthy();
    // The list is the lookup's outcome — focus lands on it.
    await waitFor(() => expect(document.activeElement).toBe(row1));
    expect(mockDeleteExpertFeedback).not.toHaveBeenCalled();
  });

  it('falls back to "no department" / "unknown reviewer" when either is missing', async () => {
    mockGetChat.mockResolvedValue({
      chat: {
        chatId: VALID_CHAT_ID,
        interactions: [
          { _id: 'int1', expertFeedback: { _id: 'ef1' } },
          { _id: 'int2', context: { department: 'IRCC' }, expertFeedback: { _id: 'ef2', expertEmail: 'b@example.ca' } },
        ],
      },
    });
    render(<DeleteExpertEval lang="en" />);
    lookup();

    expect(await screen.findByLabelText('Answer 1, no department, reviewed by unknown reviewer')).toBeTruthy();
  });

  it('deletes only the ticked rows, per interaction, with no confirm dialog', async () => {
    chatWithEvaluations();
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockDeleteExpertFeedback.mockResolvedValue({ deletedCount: 1 });
    render(<DeleteExpertEval lang="en" />);
    lookup();

    fireEvent.click(await screen.findByLabelText(ROW3));
    fireEvent.click(screen.getByText('Delete selected evaluations (1)'));

    await screen.findByText(`Deleted 1 expert evaluation(s) for ${VALID_CHAT_ID}.`);
    expect(mockDeleteExpertFeedback).toHaveBeenCalledTimes(1);
    expect(mockDeleteExpertFeedback).toHaveBeenCalledWith({ interactionId: 'int3' });
    expect(confirmSpy).not.toHaveBeenCalled();
    // The kept row is still listed, unticked; the deleted one is gone.
    expect(screen.getByLabelText(ROW1).checked).toBe(false);
    expect(screen.queryByLabelText(ROW3)).toBeNull();
  });

  it('deleting every row removes the list, clears the field and moves focus to the outcome', async () => {
    chatWithEvaluations();
    mockDeleteExpertFeedback.mockResolvedValue({ deletedCount: 1 });
    render(<DeleteExpertEval lang="en" />);
    lookup();

    fireEvent.click(await screen.findByLabelText(ROW1));
    fireEvent.click(screen.getByLabelText(ROW3));
    fireEvent.click(screen.getByText('Delete selected evaluations (2)'));

    const message = await screen.findByText(`Deleted 2 expert evaluation(s) for ${VALID_CHAT_ID}.`);
    expect(mockDeleteExpertFeedback).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('group', { name: 'Choose evaluations to delete' })).toBeNull();
    expect(screen.getByLabelText('Chat ID').value).toBe('');
    const box = message.closest('.status-message--success-box');
    expect(box).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(box));
  });

  it('shows an inline error and deletes nothing when no row is ticked', async () => {
    chatWithEvaluations();
    render(<DeleteExpertEval lang="en" />);
    lookup();

    await screen.findByLabelText(ROW1);
    fireEvent.click(screen.getByText('Delete selected evaluations (0)'));

    const error = await waitFor(() => { const el = document.querySelector('.form-error-message'); expect(el).toBeTruthy(); return el; });
    expect(error.textContent).toContain('Choose at least one evaluation to delete.');
    expect(mockDeleteExpertFeedback).not.toHaveBeenCalled();
  });

  it('reports a partial failure as an error and keeps the failed row listed', async () => {
    chatWithEvaluations();
    mockDeleteExpertFeedback.mockImplementation(({ interactionId }) => (
      interactionId === 'int1' ? Promise.resolve({ deletedCount: 1 }) : Promise.reject(new Error('Failed to fetch'))
    ));
    render(<DeleteExpertEval lang="en" />);
    lookup();

    fireEvent.click(await screen.findByLabelText(ROW1));
    fireEvent.click(screen.getByLabelText(ROW3));
    fireEvent.click(screen.getByText('Delete selected evaluations (2)'));

    const message = await screen.findByText('Deleted 1 of 2 expert evaluations. The rest could not be deleted and are still listed.');
    expect(message.closest('.status-message--error-box')).not.toBeNull();
    // No raw exception text shown.
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(screen.queryByLabelText(ROW1)).toBeNull();
    expect(screen.getByLabelText(ROW3).checked).toBe(true);
  });

  it('clears the list as soon as the admin edits the chat ID again', async () => {
    chatWithEvaluations();
    render(<DeleteExpertEval lang="en" />);
    lookup();
    await screen.findByLabelText(ROW1);

    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: VALID_CHAT_ID.replace('a', 'b') } });
    expect(screen.queryByLabelText(ROW1)).toBeNull();
  });

  it('shows "not found" when the chat does not exist', async () => {
    mockGetChat.mockResolvedValue({ chat: null });
    render(<DeleteExpertEval lang="en" />);
    lookup();

    expect(await screen.findByText('admin.deleteExpertEval.notFound')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Choose evaluations to delete' })).toBeNull();
  });

  it('shows "not evaluated" when the chat exists but has no expert feedback', async () => {
    mockGetChat.mockResolvedValue({ chat: { chatId: VALID_CHAT_ID, interactions: [{ _id: 'int1' }] } });
    render(<DeleteExpertEval lang="en" />);
    lookup();

    expect(await screen.findByText('Not evaluated.')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Choose evaluations to delete' })).toBeNull();
  });

  it('shows a distinct "lookup failed" message, not "not found", when the lookup itself fails', async () => {
    mockGetChat.mockRejectedValue(new Error('Failed to fetch'));
    render(<DeleteExpertEval lang="en" />);
    lookup();

    expect(await screen.findByText('admin.common.fetchFailed')).toBeTruthy();
    expect(screen.queryByText('admin.deleteExpertEval.notFound')).toBeNull();
  });

  it('flags a malformed chat ID as an inline error instead of looking it up', async () => {
    render(<DeleteExpertEval lang="en" />);
    lookup('not-a-real-id');

    const alert = await waitFor(() => { const el = document.querySelector('.form-error-message'); expect(el).toBeTruthy(); return el; });
    expect(alert.textContent).toContain('admin.viewChat.invalidFormat');
    expect(mockGetChat).not.toHaveBeenCalled();
  });

  it('counts an evaluation already deleted elsewhere as deleted, not stuck', async () => {
    chatWithEvaluations();
    // Server's reply when the interaction no longer has expert feedback.
    mockDeleteExpertFeedback.mockResolvedValue({ deletedCount: 0 });
    render(<DeleteExpertEval lang="en" />);
    lookup();

    fireEvent.click(await screen.findByLabelText(ROW3));
    fireEvent.click(screen.getByText('Delete selected evaluations (1)'));

    await screen.findByText(`Deleted 1 expert evaluation(s) for ${VALID_CHAT_ID}.`);
    expect(screen.queryByLabelText(ROW3)).toBeNull();
  });

  it('marks the delete outcome as announced by moving focus to it', async () => {
    chatWithEvaluations();
    mockDeleteExpertFeedback.mockResolvedValue({ deletedCount: 1 });
    render(<DeleteExpertEval lang="en" />);
    lookup();

    fireEvent.click(await screen.findByLabelText(ROW3));
    fireEvent.click(screen.getByText('Delete selected evaluations (1)'));

    const message = await screen.findByText(`Deleted 1 expert evaluation(s) for ${VALID_CHAT_ID}.`);
    expect(message.closest('[data-announced-via]').getAttribute('data-announced-via')).toBe('focus');
  });

  it('ignores a delete that finishes after the section was closed', async () => {
    chatWithEvaluations();
    let rejectDelete;
    mockDeleteExpertFeedback.mockReturnValue(new Promise((_, reject) => { rejectDelete = reject; }));
    render(<DeleteExpertEval lang="en" />);
    lookup();

    fireEvent.click(await screen.findByLabelText(ROW3));
    fireEvent.click(screen.getByText('Delete selected evaluations (1)'));
    await waitFor(() => expect(mockDeleteExpertFeedback).toHaveBeenCalled());
    toggleSection();
    rejectDelete(new Error('Failed to fetch'));

    // No crash, no list back, no outcome message, and the field is usable again.
    await waitFor(() => expect(screen.getByLabelText('Chat ID').disabled).toBe(false));
    expect(screen.queryByRole('group', { name: 'Choose evaluations to delete' })).toBeNull();
    expect(screen.queryByText(/could not be deleted|Could not delete/)).toBeNull();
  });

  it('ignores a lookup that finishes after the section was closed', async () => {
    let resolveLookup;
    mockGetChat.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    render(<DeleteExpertEval lang="en" />);
    lookup();

    await waitFor(() => expect(mockGetChat).toHaveBeenCalled());
    toggleSection();
    toggleSection();
    resolveLookup({
      chat: {
        chatId: VALID_CHAT_ID,
        interactions: [{ _id: 'int1', context: { department: 'CRA-ARC' }, expertFeedback: { _id: 'ef1', expertEmail: 'a@example.ca' } }],
      },
    });

    await waitFor(() => expect(screen.getByLabelText('Chat ID').disabled).toBe(false));
    expect(screen.queryByLabelText(ROW1)).toBeNull();
  });
});
