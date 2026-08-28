/**
 * @vitest-environment jsdom
 *
 * ChatViewer's chatId field now goes through the same partial-match search
 * as ViewChatByIdSection.js/EvalDashboardPage.js (useChatIdLookup.js's
 * searchChats/selectMatch), instead of fetching logs for whatever exact
 * string was typed. This covers the multi-match pick-list path specifically
 * — the exact-match "not found"/"refresh" behaviour is already covered by
 * ChatViewer.statusMessage.test.js and ChatViewer.dataTablesDom.test.js.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatViewer from '../ChatViewer.js';

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
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

const { mockGetChat, mockSearchChats, mockGetLogs } = vi.hoisted(() => ({
  mockGetChat: vi.fn(),
  mockSearchChats: vi.fn(),
  mockGetLogs: vi.fn(),
}));
vi.mock('../../services/DataStoreService.js', () => ({
  default: { getChat: mockGetChat, searchChats: mockSearchChats, getLogs: mockGetLogs },
}));

const CHAT_A = '123e4567-e89b-42d3-a456-426614174000';
const CHAT_B = '223e4567-e89b-42d3-a456-426614174000';

describe('ChatViewer chatId partial-match search', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('shows a pick-list for a partial fragment matching several chats, and loads logs on selection', async () => {
    mockSearchChats.mockResolvedValue({ chatIds: [CHAT_A, CHAT_B], truncated: false });
    mockGetChat.mockResolvedValue({ chat: { chatId: CHAT_B } });
    mockGetLogs.mockResolvedValue({ logs: [{ createdAt: '2026-08-12T10:00:00.000Z', logLevel: 'info', message: 'hi' }] });

    render(<ChatViewer lang="en" />);

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: '1234' } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));

    await waitFor(() => {
      expect(screen.getByText(CHAT_A)).toBeTruthy();
      expect(screen.getByText(CHAT_B)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(CHAT_B));

    await waitFor(() => {
      expect(mockGetLogs).toHaveBeenCalledWith(CHAT_B);
    });
    await waitFor(() => {
      expect(screen.queryByText(CHAT_A)).toBeNull();
    });
  });

  it('resolves a partial fragment matching exactly one chat directly, loading its logs with no pick-list', async () => {
    mockSearchChats.mockResolvedValue({ chatIds: [CHAT_A], truncated: false });
    mockGetChat.mockResolvedValue({ chat: { chatId: CHAT_A } });
    mockGetLogs.mockResolvedValue({ logs: [] });

    render(<ChatViewer lang="en" />);

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: '123e' } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));

    await waitFor(() => {
      expect(mockGetLogs).toHaveBeenCalledWith(CHAT_A);
    });
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('resolves a full ID pasted with a trailing space, trimming the field so the resolved chat is not discarded', async () => {
    mockGetChat.mockResolvedValue({ chat: { chatId: CHAT_A } });
    mockGetLogs.mockResolvedValue({ logs: [] });

    render(<ChatViewer lang="en" />);

    const input = screen.getByLabelText('logging.enterChatId');
    fireEvent.change(input, { target: { value: `${CHAT_A} ` } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));

    await waitFor(() => {
      expect(mockGetLogs).toHaveBeenCalledWith(CHAT_A);
    });
    expect(mockGetChat).toHaveBeenCalledWith(CHAT_A);
    expect(input.value).toBe(CHAT_A);
  });

  it('does not get stuck busy forever when the chatId changes before an in-flight lookup resolves', async () => {
    // checkChatExists's success path deliberately leaves loading=true for
    // resolveConfirmedChat to clear - if a chatId change mid-flight makes
    // resolveConfirmedChat bail out as stale before reaching that, nothing
    // else ever clears it (ChatViewer.js:216's fix).
    let resolveGetChat;
    mockGetChat.mockReturnValue(new Promise((resolve) => { resolveGetChat = resolve; }));
    mockGetLogs.mockResolvedValue({ logs: [] });

    render(<ChatViewer lang="en" />);

    const input = screen.getByLabelText('logging.enterChatId');
    fireEvent.change(input, { target: { value: CHAT_A } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));

    await waitFor(() => expect(input.disabled).toBe(true));

    // The viewer moves on to a different chatId while CHAT_A's lookup is
    // still in flight.
    fireEvent.change(input, { target: { value: CHAT_B } });

    // The original (now-stale) lookup resolves successfully.
    resolveGetChat({ chat: { chatId: CHAT_A } });

    await waitFor(() => expect(input.disabled).toBe(false));
    expect(screen.getByText('admin.common.chatIdSearchButton')).toBeTruthy();
    expect(mockGetLogs).not.toHaveBeenCalled();
  });
});
