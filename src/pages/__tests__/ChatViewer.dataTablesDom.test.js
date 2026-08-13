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
  default: { getLogs: vi.fn() }
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsButton: React.forwardRef(({ children, onClick, disabled, id }, ref) => (
    <button ref={ref} id={id} onClick={onClick} disabled={disabled}>{children}</button>
  ))
}));

const logEntry = (message) => ({
  createdAt: '2026-08-12T10:00:00.000Z',
  logLevel: 'info',
  message,
  metadata: { some: 'value' }
});

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
    DataStoreService.getLogs.mockResolvedValue({ logs: [logEntry('first'), logEntry('second')] });

    render(<ChatViewer lang="en" />);

    // Entering a chatId mounts the (still empty) table, which DataTables then
    // wraps — this is the state that makes the next insert dangerous.
    fireEvent.change(screen.getByLabelText('logging.enterChatId'), {
      target: { value: 'chat-abc' }
    });
    await waitFor(() => expect(document.querySelector('table.display')).toBeTruthy());

    expect(screen.queryByText('logging.download')).toBeNull();

    // Logs arriving flips logs.length 0 -> 2, inserting the download button
    // immediately before the re-parented table.
    fireEvent.click(screen.getByText('logging.refresh'));

    await waitFor(() => expect(screen.getByText('logging.download')).toBeTruthy());
    expect(DataStoreService.getLogs).toHaveBeenCalledWith('chat-abc');
  });

  it('survives logs going back to empty and populating again', async () => {
    DataStoreService.getLogs.mockResolvedValue({ logs: [logEntry('first')] });

    render(<ChatViewer lang="en" />);

    const input = screen.getByLabelText('logging.enterChatId');
    fireEvent.change(input, { target: { value: 'chat-abc' } });
    fireEvent.click(screen.getByText('logging.refresh'));
    await waitFor(() => expect(screen.getByText('logging.download')).toBeTruthy());

    // Switching chatId clears logs, removing the download button again.
    fireEvent.change(input, { target: { value: 'chat-def' } });
    await waitFor(() => expect(screen.queryByText('logging.download')).toBeNull());

    fireEvent.click(screen.getByText('logging.refresh'));
    await waitFor(() => expect(screen.getByText('logging.download')).toBeTruthy());
  });
});
