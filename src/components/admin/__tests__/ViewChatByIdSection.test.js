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
  'admin.common.chatFound': 'Chat found.',
  'admin.common.chatIdSearchTooShort': 'Enter at least 4 characters.',
  'admin.common.chatIdMatchesFound': '{count} matching chats found. Select one to continue.',
  'admin.common.chatIdMatchesMoreFound': 'More than {count} matches. Select one or enter more of the ID.',
  'admin.common.chatNotFound': 'No chat found with that ID.',
  'admin.common.fetchFailed': 'Failed to load data. Please try again.',
  'admin.viewChat.label': 'Chat ID',
  'admin.viewChat.loading': 'Looking up...',
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockGetChat, mockSearchChats } = vi.hoisted(() => ({
  mockGetChat: vi.fn(),
  mockSearchChats: vi.fn(),
}));
vi.mock('../../../services/DataStoreService.js', () => ({
  default: { getChat: mockGetChat, searchChats: mockSearchChats },
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsIcon: ({ name }) => <span data-icon={name} />,
  // target="_blank" GcdsLinks render their own external icon + new-tab
  // text; the mock only needs the href/target for these assertions.
  GcdsLink: ({ children, href, target }) => (
    <a href={href} target={target}>{children}</a>
  ),
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
  });

  // The lookup never navigates itself - it renders a new-tab link to the
  // confirmed chat's review page for the admin to click (see
  // ViewChatByIdSection.js for why not window.open()).
  const reviewHref = (chatId) => `/en?chat=${encodeURIComponent(chatId)}&review=1`;
  const expectReviewLink = (chatId) => {
    const link = screen.getByRole('link', { name: chatId });
    expect(link.getAttribute('href')).toBe(reviewHref(chatId));
    expect(link.getAttribute('target')).toBe('_blank');
    return link;
  };

  const startLookup = (chatId = VALID_CHAT_ID) => {
    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: chatId } });
    fireEvent.click(screen.getByRole('button', { name: 'Search for chat ID' }));
  };

  it('renders a new-tab review link for a full chat ID that exists, and re-enables the form', async () => {
    mockGetChat.mockResolvedValue({ chat: { chatId: VALID_CHAT_ID } });

    render(<ViewChatByIdSection lang="en" />);
    startLookup();

    await waitFor(() => expectReviewLink(VALID_CHAT_ID));
    // Focus lands on the block wrapping the "Chat found." heading AND the
    // link, so a screen reader reads both together (not the heading alone,
    // which left the admin unsure where the chat link was).
    const heading = screen.getByText('Chat found.');
    await waitFor(() => expect(document.activeElement).toBe(heading.parentElement));
    expect(document.activeElement.contains(screen.getByText(VALID_CHAT_ID))).toBe(true);
    // The hook leaves loading=true on a confirmed chat for the caller to
    // finish; this component stays mounted (no navigation), so it must
    // reset it or the button is stuck on "Looking up..." for good.
    expect(screen.getByRole('button', { name: 'Search for chat ID' }).disabled).toBe(false);
    // A full, valid-format ID resolves via the direct existence check -
    // never reaches the partial-match search endpoint.
    expect(mockSearchChats).not.toHaveBeenCalled();
  });

  it('shows "not found" and no link when the chat does not exist', async () => {
    mockGetChat.mockResolvedValue({ chat: null });

    render(<ViewChatByIdSection lang="en" />);
    startLookup();

    await waitFor(() => {
      expect(screen.getByText('No chat found with that ID.')).toBeTruthy();
    });
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a distinct "lookup failed" message, not "not found", when the existence check itself fails', async () => {
    mockGetChat.mockRejectedValue(new Error('Failed to fetch'));

    render(<ViewChatByIdSection lang="en" />);
    startLookup();

    await waitFor(() => {
      expect(screen.getByText('Failed to load data. Please try again.')).toBeTruthy();
    });
    expect(screen.queryByText('No chat found with that ID.')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('flags an empty submit as an inline error instead of searching', async () => {
    render(<ViewChatByIdSection lang="en" />);
    fireEvent.click(screen.getByRole('button', { name: 'Search for chat ID' }));

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

  it('resolves a partial fragment matching exactly one chat to a single review link', async () => {
    mockSearchChats.mockResolvedValue({ chatIds: [VALID_CHAT_ID], truncated: false });
    mockGetChat.mockResolvedValue({ chat: { chatId: VALID_CHAT_ID } });

    render(<ViewChatByIdSection lang="en" />);
    startLookup('abcdef12');

    await waitFor(() => expectReviewLink(VALID_CHAT_ID));
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('Chat found.')).toBeTruthy();
  });

  it('shows a pick-list of new-tab review links for a partial fragment matching several chats', async () => {
    mockSearchChats.mockResolvedValue({ chatIds: [VALID_CHAT_ID, OTHER_CHAT_ID], truncated: false });
    mockGetChat.mockResolvedValue({ chat: { chatId: OTHER_CHAT_ID } });

    render(<ViewChatByIdSection lang="en" />);
    startLookup('1234');

    await waitFor(() => {
      expect(screen.getByText('2 matching chats found. Select one to continue.')).toBeTruthy();
    });
    expect(screen.getByText(VALID_CHAT_ID)).toBeTruthy();
    expect(screen.getByText(OTHER_CHAT_ID)).toBeTruthy();
    // ChatIdMatchList.js moves focus to the block wrapping its heading and
    // pick-list when matches first populate - otherwise the list just
    // silently appears for a screen-reader user with no announcement and no
    // focus move at all. The wrapper, not the heading, so both links get
    // read along with the heading.
    const matchesHeading = screen.getByText('2 matching chats found. Select one to continue.');
    await waitFor(() => expect(document.activeElement).toBe(matchesHeading.parentElement));
    expect(document.activeElement.contains(screen.getByText(OTHER_CHAT_ID))).toBe(true);

    expectReviewLink(VALID_CHAT_ID);
    expectReviewLink(OTHER_CHAT_ID);
    // Real links, no second existence check on pick - the search already
    // confirmed each ID matched.
    expect(mockGetChat).not.toHaveBeenCalled();
  });

  it('says "more than {count}" when the search result was truncated, instead of the capped length', async () => {
    mockSearchChats.mockResolvedValue({ chatIds: [VALID_CHAT_ID, OTHER_CHAT_ID], truncated: true });

    render(<ViewChatByIdSection lang="en" />);
    startLookup('1234');

    await waitFor(() => {
      expect(screen.getByText(/^More than 2 matches/)).toBeTruthy();
    });
    expect(screen.queryByText(/^2 matching chats found/)).toBeNull();
  });

  it('drops the confirmed link once the admin edits the chat ID again', async () => {
    mockGetChat.mockResolvedValue({ chat: { chatId: VALID_CHAT_ID } });

    render(<ViewChatByIdSection lang="en" />);
    startLookup();
    await waitFor(() => expectReviewLink(VALID_CHAT_ID));

    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: 'abc' } });
    expect(screen.queryByRole('link')).toBeNull();
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
