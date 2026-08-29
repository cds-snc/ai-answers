/**
 * @vitest-environment jsdom
 *
 * Guards the React <-> DataTables DOM ownership boundary in ChatViewer.
 *
 * DataTables re-parents the <table> into its own container element, so the
 * table is no longer a child of the node React rendered it into. If React then
 * has to insert a sibling *before* that table — which is exactly what happens
 * when the download button appears once logs arrive — it calls
 * parent.insertBefore(button, table) against a table that is no longer its
 * child and throws NotFoundError, taking the whole page down.
 *
 * Real DataTables is used deliberately here rather than a mock: the re-parenting
 * is the entire behaviour under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ChatViewer from '../ChatViewer.js';
import DataStoreService from '../../services/DataStoreService.js';

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: (key) => key })
}));

vi.mock('../../services/DataStoreService.js', () => ({
  default: { getLogs: vi.fn(), getChat: vi.fn() }
}));

// Every search (including a re-search of an already-confirmed chat, this
// page's only refresh mechanism) confirms the chat exists via
// useChatIdLookup's getChat call before trusting getLogs' result - see
// ChatViewer.js's resolveConfirmedChat. A UUID shape is required to pass
// isValidChatIdFormat's own client-side check before any request is made.
const CHAT_ID_A = '123e4567-e89b-42d3-a456-426614174000';
const CHAT_ID_B = '223e4567-e89b-42d3-a456-426614174000';

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsButton: React.forwardRef(({ children, ...rest }, ref) => (
    <button ref={ref} {...rest}>{children}</button>
  ))
}));

const logEntry = (message, logLevel = 'info') => ({
  createdAt: '2026-08-12T10:00:00.000Z',
  logLevel,
  message,
  metadata: { some: 'value' }
});

const visibleRowCount = () => document.querySelectorAll('table.display tbody tr').length;

describe('ChatViewer - DataTables DOM ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders the download button once logs arrive without a DOM insert conflict', async () => {
    DataStoreService.getChat.mockResolvedValue({ chat: { chatId: CHAT_ID_A } });
    DataStoreService.getLogs.mockResolvedValue({ logs: [logEntry('first'), logEntry('second')] });

    render(<ChatViewer lang="en" />);

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), {
      target: { value: CHAT_ID_A }
    });

    // Searching confirms the chat and mounts the (still empty) table, which
    // DataTables then wraps — this is the state that makes the next insert
    // dangerous. Logs arriving right after flips logs.length 0 -> 2,
    // inserting the download button immediately before the re-parented
    // table, all within the same search.
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));
    await waitFor(() => expect(document.querySelector('table.display')).toBeTruthy());

    await waitFor(() => expect(screen.getByText('logging.download')).toBeTruthy());
    expect(DataStoreService.getLogs).toHaveBeenCalledWith(CHAT_ID_A);
  });

  it('survives logs going back to empty and populating again', async () => {
    // Echoes back whichever chatId it's asked about (real db-chat.js's
    // Chat.findOne({ chatId }) always does, since a doc's own chatId field
    // trivially equals whatever it was just queried by).
    DataStoreService.getChat.mockImplementation((chatId) => Promise.resolve({ chat: { chatId } }));
    DataStoreService.getLogs.mockResolvedValue({ logs: [logEntry('first')] });

    render(<ChatViewer lang="en" />);

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_ID_A } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));
    await waitFor(() => expect(screen.getByText('logging.download')).toBeTruthy());

    // There's no separate Refresh any more - re-searching the same chatId
    // (via the ID panel, reopened by clicking its summary) is the only
    // refresh mechanism, and this table stays mounted with zero rows rather
    // than getting swapped out (see useChatLogsTable's own comment), so a
    // search resolving to zero logs removes the download button (topEnd's
    // own logs.length > 0 guard, useChatLogsTable.js) without unmounting the
    // table itself.
    DataStoreService.getLogs.mockResolvedValueOnce({ logs: [] });
    fireEvent.click(screen.getByText('admin.common.viewChatById'));
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));
    await waitFor(() => expect(screen.queryByText('logging.download')).toBeNull());

    fireEvent.click(screen.getByText('admin.common.viewChatById'));
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));
    await waitFor(() => expect(screen.getByText('logging.download')).toBeTruthy());
  });

  it('level pills show per-level counts and multi-select combines levels (Warning + Error together)', async () => {
    DataStoreService.getChat.mockResolvedValue({ chat: { chatId: CHAT_ID_A } });
    DataStoreService.getLogs.mockResolvedValue({
      logs: [
        logEntry('one', 'info'),
        logEntry('two', 'info'),
        logEntry('three', 'debug'),
        logEntry('four', 'warn'),
        logEntry('five', 'error'),
      ],
    });

    render(<ChatViewer lang="en" />);
    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_ID_A } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));
    await waitFor(() => expect(visibleRowCount()).toBe(5));

    const allButton = screen.getByText('logging.all (5)');
    const infoButton = screen.getByText('logging.info (2)');
    const warnButton = screen.getByText('logging.warn (1)');
    const errorButton = screen.getByText('logging.error (1)');
    expect(allButton.getAttribute('aria-pressed')).toBe('true');
    expect(warnButton.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(warnButton);
    await waitFor(() => expect(visibleRowCount()).toBe(1));
    expect(allButton.getAttribute('aria-pressed')).toBe('false');
    expect(warnButton.getAttribute('aria-pressed')).toBe('true');

    // Combining Warning + Error is the whole point of multi-select - neither
    // deselects the other.
    fireEvent.click(errorButton);
    await waitFor(() => expect(visibleRowCount()).toBe(2));
    expect(warnButton.getAttribute('aria-pressed')).toBe('true');
    expect(errorButton.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(allButton);
    await waitFor(() => expect(visibleRowCount()).toBe(5));
    expect(warnButton.getAttribute('aria-pressed')).toBe('false');
    expect(errorButton.getAttribute('aria-pressed')).toBe('false');
    expect(infoButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('resets the level filter when a different chat is confirmed, but not when the same one is refreshed (regression)', async () => {
    // Chat A: filter to Warning, leaving 1 of 2 rows visible.
    DataStoreService.getChat.mockImplementation((chatId) => Promise.resolve({ chat: { chatId } }));
    DataStoreService.getLogs.mockResolvedValue({ logs: [logEntry('one', 'info'), logEntry('two', 'warn')] });

    // Waits for resolveConfirmedChat's whole async tail to fully settle
    // (not just for the row count to update) before the next step reopens
    // the panel - otherwise a still-in-flight search's own idPanelOpen(false)
    // can toggle a panel this test just reopened back closed again.
    const waitForIdle = () =>
      waitFor(() => expect(screen.getByText('admin.common.chatIdSearchButton')).toBeTruthy());

    render(<ChatViewer lang="en" />);
    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_ID_A } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));
    await waitFor(() => expect(visibleRowCount()).toBe(2));
    await waitForIdle();

    fireEvent.click(screen.getByText('logging.warn (1)'));
    await waitFor(() => expect(visibleRowCount()).toBe(1));

    // Re-searching the SAME chat (the only refresh mechanism) is expected to
    // keep the filter applied - that's not staleness, the admin is still
    // looking at the same trace.
    fireEvent.click(screen.getByText('admin.common.viewChatById'));
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));
    await waitFor(() => expect(DataStoreService.getChat).toHaveBeenCalledTimes(2));
    await waitForIdle();
    expect(screen.getByText('logging.warn (1)').getAttribute('aria-pressed')).toBe('true');
    expect(visibleRowCount()).toBe(1);

    // Confirming a DIFFERENT chat must not silently carry the filter over -
    // chat B's own rows should all be visible, not just its "warn" one.
    DataStoreService.getLogs.mockResolvedValue({ logs: [logEntry('three', 'info'), logEntry('four', 'debug')] });
    fireEvent.click(screen.getByText('admin.common.viewChatById'));
    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: CHAT_ID_B } });
    fireEvent.click(screen.getByText('admin.common.chatIdSearchButton'));

    await waitFor(() => expect(visibleRowCount()).toBe(2));
    expect(screen.getByText('logging.all (2)').getAttribute('aria-pressed')).toBe('true');
  });
});
