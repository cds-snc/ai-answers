/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SimilarChatsDashboard from '../SimilarChatsDashboard.js';
import { waitForAnnouncement } from '../../../../test/liveAnnouncer.js';

const TRANSLATIONS = {
  'vector.fetchErrorDetail': 'Failed to fetch similar chats: {error}',
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockGetSimilarChats } = vi.hoisted(() => ({ mockGetSimilarChats: vi.fn() }));
vi.mock('../../../services/VectorService.js', () => ({
  default: { getSimilarChats: mockGetSimilarChats },
}));

const { mockGetChat, mockSearchChats } = vi.hoisted(() => ({
  mockGetChat: vi.fn(),
  mockSearchChats: vi.fn(),
}));
vi.mock('../../../services/DataStoreService.js', () => ({
  default: { getChat: mockGetChat, searchChats: mockSearchChats },
}));

const CHAT_ID = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';

vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

describe('SimilarChatsDashboard — was window.alert(), now StatusMessage/FeedbackInlineError', () => {
  afterEach(() => {
    cleanup();
    mockGetSimilarChats.mockReset();
    mockGetChat.mockReset();
    mockSearchChats.mockReset();
    vi.restoreAllMocks();
  });

  it('rejects an empty chat ID via FeedbackInlineError tied to the input, not window.alert()', async () => {
    const alertSpy = vi.spyOn(window, 'alert');
    render(<SimilarChatsDashboard lang="en" />);

    fireEvent.click(screen.getByText('vector.getSimilarChats'));

    await waitFor(() => {
      expect(screen.getByText('admin.common.chatIdRequired')).toBeTruthy();
    });
    const input = screen.getByLabelText('vector.chatIdLabel');
    expect(input.getAttribute('aria-describedby')).toBe('similar-chats-chat-id-error');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockGetSimilarChats).not.toHaveBeenCalled();
  });

  it('announces a server-reported failure (data.success: false) as role="alert", raw detail wrapped in lang="en"', async () => {
    const alertSpy = vi.spyOn(window, 'alert');
    mockGetSimilarChats.mockResolvedValue({ success: false, message: 'no embeddings found' });
    mockGetChat.mockResolvedValue({ chat: { chatId: CHAT_ID } });

    render(<SimilarChatsDashboard lang="fr" />);
    fireEvent.change(screen.getByLabelText('vector.chatIdLabel'), { target: { value: CHAT_ID } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));

    await waitForAnnouncement('Failed to fetch similar chats: no embeddings found', 'assertive', { exact: true });
    // Exactly one code[lang="en"], not nested — renderStatusMessage does the
    // wrap itself; textContent alone can't tell a single wrap from a
    // <code lang="en"><code lang="en">...</code></code> double-wrap.
    expect(document.querySelectorAll('.status-message--error-box code[lang="en"]').length).toBe(1);
    const enSpan = document.querySelector('.status-message--error-box code[lang="en"]');
    expect(enSpan).toBeTruthy();
    expect(enSpan.textContent).toBe('no embeddings found');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('announces a thrown/network error as role="alert", wrapped in lang="en"', async () => {
    mockGetSimilarChats.mockRejectedValue(new Error('Failed to fetch'));
    mockGetChat.mockResolvedValue({ chat: { chatId: CHAT_ID } });

    render(<SimilarChatsDashboard lang="fr" />);
    fireEvent.change(screen.getByLabelText('vector.chatIdLabel'), { target: { value: CHAT_ID } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));

    await waitForAnnouncement('Failed to fetch', 'assertive');
    expect(document.querySelectorAll('.status-message--error-box code[lang="en"]').length).toBe(1);
    const enSpan = document.querySelector('.status-message--error-box code[lang="en"]');
    expect(enSpan).toBeTruthy();
    expect(enSpan.textContent).toBe('Failed to fetch');
  });

  it('clears a stale fetch error as soon as the chat ID is edited again', async () => {
    mockGetSimilarChats.mockRejectedValue(new Error('Failed to fetch'));
    mockGetChat.mockResolvedValue({ chat: { chatId: CHAT_ID } });

    render(<SimilarChatsDashboard lang="en" />);
    const input = screen.getByLabelText('vector.chatIdLabel');
    fireEvent.change(input, { target: { value: CHAT_ID } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));
    await waitFor(() => expect(document.querySelector('.status-message--error-box')).toBeTruthy());

    fireEvent.change(input, { target: { value: CHAT_ID.slice(0, 8) } });
    expect(document.querySelector('.status-message--error-box')).toBeNull();
  });

  it('uses the shared chat ID field: visible label, section heading as description, trimmed ID', async () => {
    mockGetSimilarChats.mockResolvedValue({ success: true, chats: [] });
    mockGetChat.mockResolvedValue({ chat: { chatId: CHAT_ID } });

    render(<SimilarChatsDashboard lang="en" describedById="similar-chats-heading" />);
    const input = screen.getByLabelText('vector.chatIdLabel');
    expect(input.getAttribute('aria-describedby')).toBe('similar-chats-heading');
    fireEvent.change(input, { target: { value: ` ${CHAT_ID} ` } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));

    await waitFor(() => expect(mockGetSimilarChats).toHaveBeenCalledWith(CHAT_ID));
  });

  it('finds a chat from a partial ID with one match', async () => {
    mockSearchChats.mockResolvedValue({ chatIds: [CHAT_ID], truncated: false });
    mockGetChat.mockResolvedValue({ chat: { chatId: CHAT_ID } });
    mockGetSimilarChats.mockResolvedValue({ success: true, chats: [] });

    render(<SimilarChatsDashboard lang="en" />);
    fireEvent.change(screen.getByLabelText('vector.chatIdLabel'), { target: { value: '3f2b8c' } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));

    await waitFor(() => expect(mockGetSimilarChats).toHaveBeenCalledWith(CHAT_ID));
    expect(mockSearchChats).toHaveBeenCalledWith('3f2b8c');
  });

  it('lists several matches and runs the one picked', async () => {
    const OTHER_ID = '3f2b8c1e-0000-4000-8000-000000000000';
    mockSearchChats.mockResolvedValue({ chatIds: [CHAT_ID, OTHER_ID], truncated: false });
    mockGetChat.mockResolvedValue({ chat: { chatId: OTHER_ID } });
    mockGetSimilarChats.mockResolvedValue({ success: true, chats: [] });

    render(<SimilarChatsDashboard lang="en" />);
    fireEvent.change(screen.getByLabelText('vector.chatIdLabel'), { target: { value: '3f2b8c' } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));

    fireEvent.click(await screen.findByRole('button', { name: OTHER_ID }));
    await waitFor(() => expect(mockGetSimilarChats).toHaveBeenCalledWith(OTHER_ID));
  });

  it('moves focus to the results table after a match is picked', async () => {
    const OTHER_ID = '3f2b8c1e-0000-4000-8000-000000000000';
    mockSearchChats.mockResolvedValue({ chatIds: [CHAT_ID, OTHER_ID], truncated: false });
    mockGetChat.mockResolvedValue({ chat: { chatId: OTHER_ID } });
    mockGetSimilarChats.mockResolvedValue({ success: true, chats: [] });

    render(<SimilarChatsDashboard lang="en" />);
    fireEvent.change(screen.getByLabelText('vector.chatIdLabel'), { target: { value: '3f2b8c' } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));
    fireEvent.click(await screen.findByRole('button', { name: OTHER_ID }));

    await waitFor(() => expect(document.activeElement?.tagName).toBe('TABLE'));
    expect(document.activeElement.classList.contains('focus-target')).toBe(true);
  });

  it('moves focus to the error message when fetching similar chats fails after a pick', async () => {
    const OTHER_ID = '3f2b8c1e-0000-4000-8000-000000000000';
    mockSearchChats.mockResolvedValue({ chatIds: [CHAT_ID, OTHER_ID], truncated: false });
    mockGetChat.mockResolvedValue({ chat: { chatId: OTHER_ID } });
    mockGetSimilarChats.mockRejectedValue(new Error('Network down'));

    render(<SimilarChatsDashboard lang="en" />);
    fireEvent.change(screen.getByLabelText('vector.chatIdLabel'), { target: { value: '3f2b8c' } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));
    fireEvent.click(await screen.findByRole('button', { name: OTHER_ID }));

    await waitFor(() => expect(document.activeElement?.textContent).toContain('Network down'));
    // Focus reads it - announcing too would read it twice.
    expect(document.activeElement.getAttribute('data-announced-via')).toBe('focus');
  });

  it.each([
    ['cannot be checked', () => mockGetChat.mockRejectedValue(new Error('Network down')), 'admin.common.fetchFailed'],
    ['is no longer found', () => mockGetChat.mockResolvedValue({ chat: null }), 'admin.common.chatNoLongerFound'],
  ])('moves focus to the outcome message when the picked chat %s', async (_label, mockOutcome, messageKey) => {
    const OTHER_ID = '3f2b8c1e-0000-4000-8000-000000000000';
    mockSearchChats.mockResolvedValue({ chatIds: [CHAT_ID, OTHER_ID], truncated: false });
    mockOutcome();

    render(<SimilarChatsDashboard lang="en" />);
    fireEvent.change(screen.getByLabelText('vector.chatIdLabel'), { target: { value: '3f2b8c' } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));
    fireEvent.click(await screen.findByRole('button', { name: OTHER_ID }));

    await screen.findByText(messageKey);
    await waitFor(() => expect(document.activeElement?.textContent).toContain(messageKey));
    expect(document.activeElement.getAttribute('data-announced-via')).toBe('focus');
    // The search just found it, so a failed pick is an error either way.
    expect(document.activeElement.classList.contains('status-message--error-box')).toBe(true);
    expect(mockGetSimilarChats).not.toHaveBeenCalled();
  });

  it('still announces a typed search that finds nothing, without moving focus', async () => {
    mockSearchChats.mockResolvedValue({ chatIds: [], truncated: false });

    render(<SimilarChatsDashboard lang="en" />);
    fireEvent.change(screen.getByLabelText('vector.chatIdLabel'), { target: { value: '3f2b8c' } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));

    const message = await screen.findByText('admin.common.chatNotFound');
    expect(message.closest('[data-announced-via]').getAttribute('data-announced-via')).toBe('live-announcer-polite');
    expect(document.activeElement).not.toBe(message.closest('[data-announced-via]'));
  });

  it('clears the previous results when a new search starts', async () => {
    mockGetChat.mockResolvedValue({ chat: { chatId: CHAT_ID } });
    mockGetSimilarChats.mockResolvedValue({ success: true, chats: [] });
    mockSearchChats.mockResolvedValue({ chatIds: [], truncated: false });

    const { container } = render(<SimilarChatsDashboard lang="en" />);
    const input = screen.getByLabelText('vector.chatIdLabel');
    fireEvent.change(input, { target: { value: CHAT_ID } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));
    await waitFor(() => expect(container.querySelector('table')).toBeTruthy());

    fireEvent.change(input, { target: { value: 'zzzz' } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));

    await screen.findByText('admin.common.chatNotFound');
    expect(container.querySelector('table')).toBeNull();
  });

  it('shows "no chat found" as information, not an error', async () => {
    mockSearchChats.mockResolvedValue({ chatIds: [], truncated: false });

    render(<SimilarChatsDashboard lang="en" />);
    fireEvent.change(screen.getByLabelText('vector.chatIdLabel'), { target: { value: 'zzzz' } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));

    const message = await screen.findByText('admin.common.chatNotFound');
    expect(message.closest('.status-message--info-box')).toBeTruthy();
    expect(mockGetSimilarChats).not.toHaveBeenCalled();
  });

  it('does not show a table before any successful fetch', () => {
    render(<SimilarChatsDashboard lang="en" />);
    expect(screen.queryByRole('table')).toBeNull();
  });
});
