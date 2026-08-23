/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DeleteChatSection from '../DeleteChatSection.js';

const TRANSLATIONS = {
  'admin.deleteChat.success': '{chatId} deleted successfully',
  'admin.deleteChat.error': 'Failed to delete chat: {message}',
  'admin.deleteChat.idLabel': 'Chat ID',
  'admin.deleteChat.title': 'Delete a chat from the logs',
  'admin.deleteChat.button': 'Delete chat',
  'admin.deleteChat.loading': 'Deleting...',
  'common.confirmDelete': 'Are you sure?',
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockDeleteChat, mockGetChat } = vi.hoisted(() => ({
  mockDeleteChat: vi.fn(),
  mockGetChat: vi.fn(),
}));
vi.mock('../../../services/DataStoreService.js', () => ({
  default: { deleteChat: mockDeleteChat, getChat: mockGetChat },
}));

// A well-formed chat ID (matches isValidChatIdFormat's uuidv4 pattern) -
// DeleteByChatIdSection.js now confirms the chat exists (DataStoreService
// .getChat) before the confirm dialog, so every test below needs both a
// syntactically valid ID and a resolved getChat mock, not just deleteChat.
const VALID_CHAT_ID = 'abcdef12-3456-4789-8abc-def012345678';

vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

describe('DeleteChatSection error/success announcements', () => {
  afterEach(() => {
    cleanup();
    mockDeleteChat.mockReset();
    mockGetChat.mockReset();
    vi.restoreAllMocks();
  });

  it('wraps the untranslated error detail in a lang="en" span, inside role="alert"', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockGetChat.mockResolvedValue({ chat: { chatId: VALID_CHAT_ID } });
    mockDeleteChat.mockRejectedValue(new Error('Failed to fetch'));

    render(<DeleteChatSection lang="fr" />);

    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: VALID_CHAT_ID } });
    fireEvent.click(screen.getByText('Delete chat'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Failed to delete chat: Failed to fetch');

    const enSpan = alert.querySelector('span[lang="en"]');
    expect(enSpan).toBeTruthy();
    expect(enSpan.textContent).toBe('Failed to fetch');
  });

  it('announces a successful delete as role="status", not role="alert"', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockGetChat.mockResolvedValue({ chat: { chatId: VALID_CHAT_ID } });
    mockDeleteChat.mockResolvedValue({});

    render(<DeleteChatSection lang="en" />);

    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: VALID_CHAT_ID } });
    fireEvent.click(screen.getByText('Delete chat'));

    const expectedText = `${VALID_CHAT_ID} deleted successfully`;
    await waitFor(() => {
      expect(screen.getByText(expectedText)).toBeTruthy();
    });
    expect(screen.getByText(expectedText).closest('[role="status"]')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears the stale message and the typed chat ID when the row is collapsed', async () => {
    // "Not found" (unlike a successful delete) deliberately leaves the typed
    // ID in place — the field only clearing via the toggle, not as a
    // byproduct of the result itself, is what this test needs to isolate.
    mockGetChat.mockResolvedValue({ chat: null });

    const { container } = render(<DeleteChatSection lang="en" />);

    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: VALID_CHAT_ID } });
    fireEvent.click(screen.getByText('Delete chat'));
    await waitFor(() => {
      expect(screen.getByText('admin.viewChat.notFound')).toBeTruthy();
    });
    expect(screen.getByLabelText('Chat ID').value).toBe(VALID_CHAT_ID);

    // jsdom doesn't simulate native <details> open/close from a click, so
    // the toggle event has to be dispatched directly.
    fireEvent(container.querySelector('details'), new Event('toggle'));

    expect(screen.queryByText('admin.viewChat.notFound')).toBeNull();
    expect(screen.getByLabelText('Chat ID').value).toBe('');
  });

  it('shows "not found" and skips the confirm dialog when the chat does not exist', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockGetChat.mockResolvedValue({ chat: null });

    render(<DeleteChatSection lang="en" />);

    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: VALID_CHAT_ID } });
    fireEvent.click(screen.getByText('Delete chat'));

    await waitFor(() => {
      expect(screen.getByText('admin.viewChat.notFound')).toBeTruthy();
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockDeleteChat).not.toHaveBeenCalled();
  });

  it('flags a malformed chat ID as an inline error instead of looking it up', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');

    render(<DeleteChatSection lang="en" />);

    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: 'not-a-real-id' } });
    fireEvent.click(screen.getByText('Delete chat'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('admin.viewChat.invalidFormat');
    expect(mockGetChat).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
