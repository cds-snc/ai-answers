/**
 * @vitest-environment jsdom
 *
 * ChatViewer is staged: search/confirm a chat ID first, then the level
 * filter and trace/log view appear — not gated on "something is typed"
 * (chatId), only on a chat actually being confirmed found
 * (hasConfirmedChat). Search is NOT staged - it stays mounted throughout,
 * and doubles as the only refresh mechanism: re-submitting an
 * already-confirmed chatId re-runs the same existence check + log fetch;
 * there is no separate Refresh button, and no Clear button - editing the
 * chatId field is a draft, not a commitment, so it doesn't clear or hide
 * whatever's already loaded either; only an explicit Search does that.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatViewer from '../ChatViewer.js';
import { waitForAnnouncement } from '../../../test/liveAnnouncer.js';

const mockT = (key) => key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

vi.mock('../../hooks/chatviewer/useChatTimeline.js', () => ({
  useChatTimeline: () => null,
}));
vi.mock('../../hooks/chatviewer/useChatLogsTable.js', () => ({
  useChatLogsTable: () => {},
}));
vi.mock('prismjs/themes/prism.css', () => ({}));
vi.mock('prismjs/components/prism-json.js', () => ({}));
vi.mock('prismjs/components/prism-xml-doc.js', () => ({}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <p>{children}</p>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  // aria-disabled, not the native attribute - matches the real GcdsButton
  // (its own `disabled` prop reflects to aria-disabled, not native
  // disabled), which is exactly why a Refresh results click can rely on
  // focus just staying put through the isBusy window instead of needing an
  // explicit refocus.
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} aria-disabled={disabled || undefined}>{children}</button>
  ),
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

const { mockGetChat, mockGetLogs } = vi.hoisted(() => ({
  mockGetChat: vi.fn(),
  mockGetLogs: vi.fn(),
}));
vi.mock('../../services/DataStoreService.js', () => ({
  default: { getChat: mockGetChat, searchChats: vi.fn(), getLogs: mockGetLogs },
}));

const CHAT_A = '123e4567-e89b-42d3-a456-426614174000';
const CHAT_B = '223e4567-e89b-42d3-a456-426614174000';

// The ID panel collapses itself once a chat's confirmed (resolveConfirmedChat)
// - reopen it (native <details>/<summary> toggle, real in jsdom 26+) to reach
// the chatId input/Search again, same as an admin clicking the summary.
const reopenIdPanel = () => {
  fireEvent.click(screen.getByText('admin.common.viewChatById'));
};

describe('ChatViewer staged reveal', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('hides the level filter until a chat is confirmed found; Search stays visible throughout', async () => {
    mockGetChat.mockImplementation((chatId) => Promise.resolve({ chat: { chatId } }));
    mockGetLogs.mockResolvedValue({ logs: [] });

    render(<ChatViewer lang="en" />);

    expect(screen.queryByLabelText('logging.filterByLevel')).toBeNull();
    expect(screen.getByText('admin.common.chatIdSearchButton')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_A } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));

    await waitFor(() => {
      expect(screen.getByLabelText('logging.filterByLevel')).toBeTruthy();
    });
    // Search isn't swapped away or unmounted once confirmed - there's no
    // separate Refresh button.
    expect(screen.getByText('admin.common.chatIdSearchButton')).toBeTruthy();
  });

  it('does not hide or clear the loaded results when the admin edits the chatId field afterward', async () => {
    mockGetChat.mockImplementation((chatId) => Promise.resolve({ chat: { chatId } }));
    mockGetLogs.mockResolvedValue({ logs: [] });

    render(<ChatViewer lang="en" />);

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_A } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));
    await waitFor(() => expect(screen.getByLabelText('logging.filterByLevel')).toBeTruthy());

    reopenIdPanel();
    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_B } });

    // Editing is a draft - CHAT_A's results/level filter stay exactly as they
    // were until an explicit new Search resolves.
    expect(screen.getByLabelText('logging.filterByLevel')).toBeTruthy();
    expect(mockGetLogs).toHaveBeenCalledTimes(1);
  });

  it('re-submitting the same chatId acts as the only refresh mechanism (re-runs the existence check and re-fetches logs)', async () => {
    mockGetChat.mockImplementation((chatId) => Promise.resolve({ chat: { chatId } }));
    mockGetLogs.mockResolvedValue({ logs: [] });

    render(<ChatViewer lang="en" />);

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_A } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));
    await waitFor(() => expect(mockGetLogs).toHaveBeenCalledTimes(1));
    expect(mockGetChat).toHaveBeenCalledTimes(1);

    reopenIdPanel();
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));

    await waitFor(() => expect(mockGetLogs).toHaveBeenCalledTimes(2));
    // Unlike the old dedicated Refresh path, every "refresh" here is a full
    // re-search - there's no lighter-weight path that skips the existence
    // check.
    expect(mockGetChat).toHaveBeenCalledTimes(2);
  });

  it('the "Refresh results" button re-runs the same search without reopening the ID panel', async () => {
    mockGetChat.mockImplementation((chatId) => Promise.resolve({ chat: { chatId } }));
    mockGetLogs.mockResolvedValue({ logs: [] });

    render(<ChatViewer lang="en" />);

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_A } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));
    await waitFor(() => expect(mockGetLogs).toHaveBeenCalledTimes(1));

    // Sits right below the "Trace for: {chatId}" line - reachable without
    // touching the (by-now collapsed) ID panel at all.
    fireEvent.click(screen.getByText('logging.refreshResults'));

    await waitFor(() => expect(mockGetLogs).toHaveBeenCalledTimes(2));
    expect(mockGetChat).toHaveBeenCalledTimes(2);
  });

  it('confirms a Refresh results click with a real visible message and leaves focus on the button itself - not the sr-only path an initial search uses', async () => {
    mockGetChat.mockImplementation((chatId) => Promise.resolve({ chat: { chatId } }));
    mockGetLogs.mockResolvedValue({ logs: [{ createdAt: '2026-08-12T10:00:00.000Z', logLevel: 'info', message: 'hi' }] });

    render(<ChatViewer lang="en" />);

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_A } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));
    await waitFor(() => expect(mockGetLogs).toHaveBeenCalledTimes(1));
    // The initial search's own success is announce-only - not a visible
    // box yet.
    await waitForAnnouncement('logging.refreshComplete');
    expect(screen.queryByText('logging.refreshComplete')).toBeNull();

    const refreshButton = screen.getByText('logging.refreshResults');
    refreshButton.focus();
    fireEvent.click(refreshButton);
    await waitFor(() => expect(mockGetLogs).toHaveBeenCalledTimes(2));

    // This time it's a real, seen box.
    const visibleOne = await screen.findByText('logging.refreshComplete', { selector: '.status-message--success-box' });
    expect(visibleOne).toBeTruthy();

    // No explicit refocus for this path (unlike the initial-search path,
    // whose collapsing ID panel takes focus with it) - standard button
    // behaviour just leaves focus where the admin's own click already put
    // it, since nothing here ever truly disables (native attribute) or
    // removes the button.
    expect(document.activeElement).toBe(refreshButton);
  });

  it('clears the visible Refresh results message on any interaction down in the log entries (e.g. a level pill), not just another refresh', async () => {
    mockGetChat.mockImplementation((chatId) => Promise.resolve({ chat: { chatId } }));
    mockGetLogs.mockResolvedValue({ logs: [{ createdAt: '2026-08-12T10:00:00.000Z', logLevel: 'info', message: 'hi' }] });

    render(<ChatViewer lang="en" />);

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_A } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));
    await waitFor(() => expect(mockGetLogs).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('logging.refreshResults'));
    await waitFor(() => expect(mockGetLogs).toHaveBeenCalledTimes(2));
    const visibleBefore = screen
      .getAllByText('logging.refreshComplete')
      .find((el) => !el.closest('.sr-only'));
    expect(visibleBefore).toBeTruthy();

    // A level pill click is real React content in this table (unlike the
    // DataTables-owned rows, mocked away here) - bubbles up through the
    // same delegated listener a metadata expand/collapse toggle or a
    // DataTables sort header/search box would.
    fireEvent.click(screen.getByText('logging.info (1)'));

    const remaining = screen
      .queryAllByText('logging.refreshComplete')
      .filter((el) => !el.closest('.sr-only'));
    expect(remaining).toHaveLength(0);
  });
});
