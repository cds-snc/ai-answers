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
  'admin.deleteExpertEval.button': 'Delete expert evaluation',
  'admin.deleteExpertEval.loading': 'Deleting...',
  'admin.deleteExpertEval.error': 'Failed to delete expert evaluation: {message}',
  'admin.deleteExpertEval.notEvaluated': 'Not evaluated.',
  'admin.deleteExpertEval.success': 'Deleted {count} expert feedback record(s) for {chatId}.',
  'common.confirmDelete': 'Are you sure you want to delete this data?',
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockDeleteExpertEval, mockGetChat } = vi.hoisted(() => ({
  mockDeleteExpertEval: vi.fn(),
  mockGetChat: vi.fn(),
}));
vi.mock('../../services/EvaluationService.js', () => ({
  default: { deleteExpertEval: mockDeleteExpertEval },
}));
vi.mock('../../services/DataStoreService.js', () => ({
  default: { getChat: mockGetChat },
}));

// A well-formed chat ID (matches isValidChatIdFormat's uuidv4 pattern) -
// DeleteByChatIdSection.js now confirms the chat exists (DataStoreService
// .getChat) before the confirm dialog, so every test below needs both a
// syntactically valid ID and a resolved getChat mock, not just deleteExpertEval.
const VALID_CHAT_ID = 'abcdef12-3456-4789-8abc-def012345678';

vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

describe('DeleteExpertEval error/success announcements', () => {
  afterEach(() => {
    cleanup();
    mockDeleteExpertEval.mockReset();
    mockGetChat.mockReset();
    vi.restoreAllMocks();
  });

  const startDelete = (chatId = VALID_CHAT_ID) => {
    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: chatId } });
    fireEvent.click(screen.getByText('Delete expert evaluation'));
  };

  // Every "delete proceeds" test needs the existence pre-check to resolve as
  // found *and* have expert feedback (validateChat's real precondition for
  // this consumer — see DeleteExpertEval.js), or it never reaches
  // window.confirm()/onDelete at all.
  const chatExists = () => mockGetChat.mockResolvedValue({
    chat: { chatId: VALID_CHAT_ID, interactions: [{ expertFeedback: { id: 'ef1' } }] },
  });

  it('asks for confirmation via window.confirm before deleting', async () => {
    chatExists();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDeleteExpertEval.mockResolvedValue({ message: 'Deleted 1 expert feedback(s) for chat abc123', deletedCount: 1 });

    render(<DeleteExpertEval lang="en" />);
    startDelete();

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this data?'));
  });

  it('does not delete when the confirmation dialog is cancelled', async () => {
    chatExists();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<DeleteExpertEval lang="en" />);
    startDelete();

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(mockDeleteExpertEval).not.toHaveBeenCalled();
  });

  it('announces a successful delete (deletedCount > 0) as role="status", using the translated key not the raw API message', async () => {
    chatExists();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    // data.message is server-built, untranslated English text (kept in the
    // response for logging) — the component must display the translated
    // admin.deleteExpertEval.success key instead, not this raw string.
    mockDeleteExpertEval.mockResolvedValue({ message: 'Deleted 1 expert feedback(s) for chat abc123', deletedCount: 1 });

    render(<DeleteExpertEval lang="en" />);
    startDelete();

    // The status region is now persistently mounted (see StatusMessage's
    // `persistent` prop / this PR's a11y fix), so findByRole('status') would
    // resolve to the still-empty region before the delete result lands —
    // wait for the actual text instead.
    const status = await screen.findByText(`Deleted 1 expert feedback record(s) for ${VALID_CHAT_ID}.`);
    expect(status.closest('[role="status"]')).not.toBeNull();
    expect(status.closest('.status-message--success-box')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Deleted 1 expert feedback(s) for chat abc123')).toBeNull();
  });

  it('treats deletedCount: 0 as an error ("Not evaluated"), not a success', async () => {
    chatExists();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDeleteExpertEval.mockResolvedValue({ message: 'Deleted 0 expert feedback(s) for chat abc123', deletedCount: 0 });

    render(<DeleteExpertEval lang="en" />);
    startDelete();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Failed to delete expert evaluation: Not evaluated.');
    // "Not evaluated" is a known translated reason, not raw exception text —
    // shouldn't get the lang="en" pronunciation wrapper.
    expect(alert.querySelector('span[lang="en"]')).toBeNull();
  });

  it('announces a chat deleted between the existence check and the delete call (server-side 404 race) in a lang="en" span, inside role="alert"', async () => {
    // The existence pre-check found it, but the actual delete call still
    // fails server-side (e.g. the chat was removed in the gap between the
    // two requests) — EvaluationService.deleteExpertEval throws for the
    // API's 404 the same way (services/EvaluationService.js:89, `{ error:
    // 'Chat not found', status: 404 }`), so DeleteExpertEval.js's own catch
    // block still needs to handle it, pre-check or not.
    chatExists();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDeleteExpertEval.mockRejectedValue(new Error('Chat not found'));

    render(<DeleteExpertEval lang="fr" />);
    startDelete();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Failed to delete expert evaluation: Chat not found');

    const enSpan = alert.querySelector('span[lang="en"]');
    expect(enSpan).toBeTruthy();
    expect(enSpan.textContent).toBe('Chat not found');
  });

  it('wraps a generic network/server error in a lang="en" span too', async () => {
    chatExists();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDeleteExpertEval.mockRejectedValue(new Error('Failed to fetch'));

    render(<DeleteExpertEval lang="fr" />);
    startDelete();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Failed to delete expert evaluation: Failed to fetch');
    expect(alert.querySelector('span[lang="en"]')).toBeTruthy();
  });

  it('clears a stale result message as soon as the admin edits the chat ID again', async () => {
    chatExists();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDeleteExpertEval.mockRejectedValue(new Error('Chat not found'));

    render(<DeleteExpertEval lang="en" />);
    startDelete();
    await screen.findByRole('alert');

    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: VALID_CHAT_ID.replace('a', 'b') } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows "not found" and skips the confirm dialog when the chat does not exist', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockGetChat.mockResolvedValue({ chat: null });

    render(<DeleteExpertEval lang="en" />);
    startDelete();

    await waitFor(() => {
      expect(screen.getByText('admin.common.chatNotFound')).toBeTruthy();
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockDeleteExpertEval).not.toHaveBeenCalled();
  });

  it('shows "not evaluated" and skips the confirm dialog when the chat exists but has no expert feedback', async () => {
    // The real precondition for this consumer isn't "does the chat exist"
    // (a chat can exist with zero expert feedback) — validateChat checks
    // the actual thing, from the same getChat() response, no second request.
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockGetChat.mockResolvedValue({ chat: { chatId: VALID_CHAT_ID, interactions: [{ question: 'q' }] } });

    render(<DeleteExpertEval lang="en" />);
    startDelete();

    await waitFor(() => {
      expect(screen.getByText('Not evaluated.')).toBeTruthy();
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockDeleteExpertEval).not.toHaveBeenCalled();
  });

  it('shows a distinct "lookup failed" message, not "not found", when the existence check itself fails', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockGetChat.mockRejectedValue(new Error('Failed to fetch'));

    render(<DeleteExpertEval lang="en" />);
    startDelete();

    await waitFor(() => {
      expect(screen.getByText('admin.common.fetchFailed')).toBeTruthy();
    });
    expect(screen.queryByText('admin.common.chatNotFound')).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockDeleteExpertEval).not.toHaveBeenCalled();
  });

  it('flags a malformed chat ID as an inline error instead of looking it up', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');

    render(<DeleteExpertEval lang="en" />);
    startDelete('not-a-real-id');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('admin.viewChat.invalidFormat');
    expect(mockGetChat).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
