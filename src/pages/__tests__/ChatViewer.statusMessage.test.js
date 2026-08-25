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

const { mockRefreshLogs } = vi.hoisted(() => ({ mockRefreshLogs: vi.fn() }));
vi.mock('../../hooks/chatviewer/useChatLogs.js', () => ({
  useChatLogs: () => ({
    clearLogs: vi.fn(),
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
vi.mock('../../components/chatviewer/MetadataModal.js', () => ({ default: () => null }));
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

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: 'chat-123' } });
    fireEvent.click(screen.getByText('logging.refresh'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('logging.refreshFailed');
  });

  it('announces a successful refresh as role="status", not role="alert"', async () => {
    mockRefreshLogs.mockResolvedValue({ logs: [{ id: 1 }, { id: 2 }], error: null });

    render(<ChatViewer lang="en" />);

    fireEvent.change(screen.getByLabelText('logging.enterChatId'), { target: { value: 'chat-123' } });
    fireEvent.click(screen.getByText('logging.refresh'));

    await waitFor(() => {
      expect(screen.getByText('logging.refreshComplete')).toBeTruthy();
    });
    expect(screen.getByText('logging.refreshComplete').closest('[role="status"]')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
