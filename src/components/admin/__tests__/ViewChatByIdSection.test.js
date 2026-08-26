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
  'admin.common.chatIdSearchPlaceholder': 'Enter chat ID (partial or full)',
  'admin.common.chatIdSearchButton': 'Search for chat ID',
  'admin.common.chatIdSearchTooShort': 'Enter at least 4 characters.',
  'admin.common.chatIdMatchesFound': '{count} matching chats found. Select one to continue.',
  'admin.common.chatIdMatchesTruncated': 'Showing the first {count} matches.',
  'admin.common.chatNotFound': 'No chat found with that ID.',
  'admin.common.fetchFailed': 'Failed to load data. Please try again.',
  'admin.viewChat.label': 'Chat ID',
  'admin.viewChat.loading': 'Looking up...',
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockGetChat, mockSearchChats, mockNavigate } = vi.hoisted(() => ({
  mockGetChat: vi.fn(),
  mockSearchChats: vi.fn(),
  mockNavigate: vi.fn(),
}));
vi.mock('../../../services/DataStoreService.js', () => ({
  default: { getChat: mockGetChat, searchChats: mockSearchChats },
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

// A well-formed chat ID (matches isValidChatIdFormat's uuidv4 pattern) -
// this shape resolves directly via DataStoreService.getChat, never reaching
// searchChats.
const VALID_CHAT_ID = 'abcdef12-3456-4789-8abc-def012345678';
const OTHER_CHAT_ID = '11111111-2222-4333-8444-555555555555';

describe('ViewChatByIdSection', () => {
  afterEach(() => {
    cleanup();
    mockGetChat.mockReset();
    mockSearchChats.mockReset();
    mockNavigate.mockReset();
  });

  const startLookup = (chatId = VALID_CHAT_ID) => {
    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: chatId } });
    fireEvent.click(screen.getByText('Search for chat ID'));
  };

  it('navigates to the review page for a full chat ID that exists', async () => {
    mockGetChat.mockResolvedValue({ chat: { chatId: VALID_CHAT_ID } });

    render(<ViewChatByIdSection lang="en" />);
    startLookup();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/en?chat=${encodeURIComponent(VALID_CHAT_ID)}&review=1`);
    });
    // A full, valid-format ID resolves via the direct existence check -
    // never reaches the partial-match search endpoint.
    expect(mockSearchChats).not.toHaveBeenCalled();
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

  it('flags an empty submit as an inline error instead of searching', async () => {
    render(<ViewChatByIdSection lang="en" />);
    fireEvent.click(screen.getByText('Search for chat ID'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Please enter a chat ID.');
    expect(mockGetChat).not.toHaveBeenCalled();
    expect(mockSearchChats).not.toHaveBeenCalled();
  });

  it('flags a fragment shorter than the minimum as an inline error instead of searching', async () => {
    render(<ViewChatByIdSection lang="en" />);
    startLookup('abc');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Enter at least 4 characters.');
    expect(mockSearchChats).not.toHaveBeenCalled();
  });

  it('resolves a partial fragment matching exactly one chat directly, with no pick-list', async () => {
    mockSearchChats.mockResolvedValue({ chatIds: [VALID_CHAT_ID], truncated: false });
    mockGetChat.mockResolvedValue({ chat: { chatId: VALID_CHAT_ID } });

    render(<ViewChatByIdSection lang="en" />);
    startLookup('abcdef12');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/en?chat=${encodeURIComponent(VALID_CHAT_ID)}&review=1`);
    });
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows a pick-list for a partial fragment matching several chats, and navigates on selection', async () => {
    mockSearchChats.mockResolvedValue({ chatIds: [VALID_CHAT_ID, OTHER_CHAT_ID], truncated: false });
    mockGetChat.mockResolvedValue({ chat: { chatId: OTHER_CHAT_ID } });

    render(<ViewChatByIdSection lang="en" />);
    startLookup('1234');

    await waitFor(() => {
      expect(screen.getByText('2 matching chats found. Select one to continue.')).toBeTruthy();
    });
    expect(screen.getByText(VALID_CHAT_ID)).toBeTruthy();
    expect(screen.getByText(OTHER_CHAT_ID)).toBeTruthy();

    fireEvent.click(screen.getByText(OTHER_CHAT_ID));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/en?chat=${encodeURIComponent(OTHER_CHAT_ID)}&review=1`);
    });
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
