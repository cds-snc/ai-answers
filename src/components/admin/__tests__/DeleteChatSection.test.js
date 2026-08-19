/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DeleteChatSection from '../DeleteChatSection.js';

const TRANSLATIONS = {
  'admin.deleteChat.success': 'Chat deleted successfully',
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

const { mockDeleteChat } = vi.hoisted(() => ({ mockDeleteChat: vi.fn() }));
vi.mock('../../../services/DataStoreService.js', () => ({
  default: { deleteChat: mockDeleteChat },
}));

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
    vi.restoreAllMocks();
  });

  it('wraps the untranslated error detail in a lang="en" span, inside role="alert"', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDeleteChat.mockRejectedValue(new Error('Failed to fetch'));

    render(<DeleteChatSection lang="fr" />);

    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByText('Delete chat'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Failed to delete chat: Failed to fetch');

    const enSpan = alert.querySelector('span[lang="en"]');
    expect(enSpan).toBeTruthy();
    expect(enSpan.textContent).toBe('Failed to fetch');
  });

  it('announces a successful delete as role="status", not role="alert"', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDeleteChat.mockResolvedValue({});

    render(<DeleteChatSection lang="en" />);

    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByText('Delete chat'));

    await waitFor(() => {
      expect(screen.getByText('Chat deleted successfully')).toBeTruthy();
    });
    expect(screen.getByText('Chat deleted successfully').closest('[role="status"]')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
