/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ViewChatByIdSection from '../ViewChatByIdSection.js';

const TRANSLATIONS = {
  'admin.common.viewChatById': 'View chat by ID',
  'admin.common.chatIdRequired': 'Please enter a chat ID.',
  'admin.common.chatIdPlaceholder': 'Enter full chat ID',
  'admin.common.chatNotFound': 'No chat found with that ID.',
  'admin.common.fetchFailed': 'Failed to load data. Please try again.',
  'admin.viewChat.label': 'Chat ID',
  'admin.viewChat.button': 'View chat',
  'admin.viewChat.loading': 'Looking up...',
  'admin.viewChat.invalidFormat': 'Invalid chat ID format',
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockGetChat, mockNavigate } = vi.hoisted(() => ({
  mockGetChat: vi.fn(),
  mockNavigate: vi.fn(),
}));
vi.mock('../../../services/DataStoreService.js', () => ({
  default: { getChat: mockGetChat },
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

// A well-formed chat ID (matches isValidChatIdFormat's uuidv4 pattern).
const VALID_CHAT_ID = 'abcdef12-3456-4789-8abc-def012345678';

describe('ViewChatByIdSection', () => {
  afterEach(() => {
    cleanup();
    mockGetChat.mockReset();
    mockNavigate.mockReset();
  });

  const startLookup = (chatId = VALID_CHAT_ID) => {
    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: chatId } });
    fireEvent.click(screen.getByText('View chat'));
  };

  it('navigates to the review page for a chat that exists', async () => {
    mockGetChat.mockResolvedValue({ chat: { chatId: VALID_CHAT_ID } });

    render(<ViewChatByIdSection lang="en" />);
    startLookup();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/en?chat=${encodeURIComponent(VALID_CHAT_ID)}&review=1`);
    });
  });

  it('shows "not found" and does not navigate when the chat does not exist', async () => {
    mockGetChat.mockResolvedValue({ chat: null });

    render(<ViewChatByIdSection lang="en" />);
    startLookup();

    await waitFor(() => {
      expect(screen.getByText('No chat found with that ID.')).toBeTruthy();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a distinct "lookup failed" message, not "not found", when the existence check itself fails', async () => {
    mockGetChat.mockRejectedValue(new Error('Failed to fetch'));

    render(<ViewChatByIdSection lang="en" />);
    startLookup();

    await waitFor(() => {
      expect(screen.getByText('Failed to load data. Please try again.')).toBeTruthy();
    });
    expect(screen.queryByText('No chat found with that ID.')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('flags an empty submit as an inline error instead of looking it up', async () => {
    render(<ViewChatByIdSection lang="en" />);
    fireEvent.click(screen.getByText('View chat'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Please enter a chat ID.');
    expect(mockGetChat).not.toHaveBeenCalled();
  });

  it('flags a malformed chat ID as an inline error instead of looking it up', async () => {
    render(<ViewChatByIdSection lang="en" />);
    startLookup('not-a-real-id');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Invalid chat ID format');
    expect(mockGetChat).not.toHaveBeenCalled();
  });

  it('clears the stale message and the typed chat ID when the row is collapsed', async () => {
    mockGetChat.mockResolvedValue({ chat: null });

    const { container } = render(<ViewChatByIdSection lang="en" />);
    startLookup();

    await waitFor(() => {
      expect(screen.getByText('No chat found with that ID.')).toBeTruthy();
    });
    expect(screen.getByLabelText('Chat ID').value).toBe(VALID_CHAT_ID);

    // jsdom doesn't simulate native <details> open/close from a click, so
    // the toggle event has to be dispatched directly.
    fireEvent(container.querySelector('details'), new Event('toggle'));

    expect(screen.queryByText('No chat found with that ID.')).toBeNull();
    expect(screen.getByLabelText('Chat ID').value).toBe('');
  });
});
