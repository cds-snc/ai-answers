/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatViewer from '../ChatViewer.js';

const mockT = (key) => key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

// Refresh now confirms the chat exists (via useChatIdLookup's getChat call,
// which also requires a UUID-shaped chatId) before trusting refreshLogs'
// result — see ChatViewer.js's handleRefreshLogs.
const { CHAT_ID } = vi.hoisted(() => ({ CHAT_ID: '123e4567-e89b-42d3-a456-426614174000' }));
vi.mock('../../services/DataStoreService.js', () => ({
  default: { getChat: vi.fn().mockResolvedValue({ chat: { chatId: CHAT_ID } }) },
}));

const { mockRefreshLogs } = vi.hoisted(() => ({ mockRefreshLogs: vi.fn() }));
vi.mock('../../hooks/chatviewer/useChatLogs.js', () => ({
  useChatLogs: () => ({
    isRefreshingLogs: false,
    logs: [],
    refreshLogs: mockRefreshLogs,
  }),
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

describe('ChatViewer refresh-logs StatusMessage roles', () => {
  afterEach(() => {
    cleanup();
    mockRefreshLogs.mockReset();
  });

  it('announces a failed refresh as role="alert"', async () => {
    mockRefreshLogs.mockResolvedValue({ logs: [], error: 'fetch failed' });

    render(<ChatViewer lang="en" />);

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_ID } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('logging.refreshFailed');
  });

  it('announces a successful refresh as role="status", not role="alert"', async () => {
    mockRefreshLogs.mockResolvedValue({ logs: [{ id: 1 }, { id: 2 }], error: null });

    render(<ChatViewer lang="en" />);

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_ID } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));

    await waitFor(() => {
      expect(screen.getByText('logging.refreshComplete')).toBeTruthy();
    });
    expect(screen.getByText('logging.refreshComplete').closest('[role="status"]')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('re-announces a second consecutive identical refresh failure without remounting the live region', async () => {
    mockRefreshLogs.mockResolvedValue({ logs: [], error: 'fetch failed' });

    render(<ChatViewer lang="en" />);

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_ID } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));

    const firstAlert = await screen.findByRole('alert');
    expect(firstAlert.textContent).toContain('logging.refreshFailed');

    // Same chatId re-submitted (the only refresh mechanism) - identical
    // failure outcome. Without a nonce, setting the exact same message
    // string again is a no-op React bails on: same DOM node, no mutation,
    // nothing for a screen reader to pick up. The fix (StatusMessage.js)
    // forces a real mutation on the SAME node rather than recreating a fresh
    // one - a fresh node reproduces the "text already there on insertion"
    // problem `persistent` exists to prevent in the first place.
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));

    await waitFor(() => expect(mockRefreshLogs).toHaveBeenCalledTimes(2));
    const secondAlert = await screen.findByRole('alert');
    expect(secondAlert.textContent).toContain('logging.refreshFailed');
    expect(secondAlert).toBe(firstAlert);
  });
});
