/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SimilarChatsDashboard from '../SimilarChatsDashboard.js';

const TRANSLATIONS = {
  'vector.fetchErrorDetail': 'Failed to fetch similar chats: {message}',
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockGetSimilarChats } = vi.hoisted(() => ({ mockGetSimilarChats: vi.fn() }));
vi.mock('../../../services/VectorService.js', () => ({
  default: { getSimilarChats: mockGetSimilarChats },
}));

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
    vi.restoreAllMocks();
  });

  it('rejects an empty chat ID via FeedbackInlineError tied to the input, not window.alert()', async () => {
    const alertSpy = vi.spyOn(window, 'alert');
    render(<SimilarChatsDashboard lang="en" />);

    fireEvent.click(screen.getByText('vector.getSimilarChats'));

    await waitFor(() => {
      expect(screen.getByText('vector.enterChatId')).toBeTruthy();
    });
    const input = screen.getByPlaceholderText('vector.chatIdPlaceholder');
    expect(input.getAttribute('aria-describedby')).toBe('similar-chats-chat-id-error');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockGetSimilarChats).not.toHaveBeenCalled();
  });

  it('announces a server-reported failure (data.success: false) as role="alert", raw detail wrapped in lang="en"', async () => {
    const alertSpy = vi.spyOn(window, 'alert');
    mockGetSimilarChats.mockResolvedValue({ success: false, message: 'no embeddings found' });

    render(<SimilarChatsDashboard lang="fr" />);
    fireEvent.change(screen.getByPlaceholderText('vector.chatIdPlaceholder'), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Failed to fetch similar chats: no embeddings found');
    const enSpan = alert.querySelector('code[lang="en"]');
    expect(enSpan).toBeTruthy();
    expect(enSpan.textContent).toBe('no embeddings found');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('announces a thrown/network error as role="alert", wrapped in lang="en"', async () => {
    mockGetSimilarChats.mockRejectedValue(new Error('Failed to fetch'));

    render(<SimilarChatsDashboard lang="fr" />);
    fireEvent.change(screen.getByPlaceholderText('vector.chatIdPlaceholder'), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));

    const alert = await screen.findByRole('alert');
    const enSpan = alert.querySelector('code[lang="en"]');
    expect(enSpan).toBeTruthy();
    expect(enSpan.textContent).toBe('Failed to fetch');
  });

  it('clears a stale fetch error as soon as the chat ID is edited again', async () => {
    mockGetSimilarChats.mockRejectedValue(new Error('Failed to fetch'));

    render(<SimilarChatsDashboard lang="en" />);
    const input = screen.getByPlaceholderText('vector.chatIdPlaceholder');
    fireEvent.change(input, { target: { value: 'abc123' } });
    fireEvent.click(screen.getByText('vector.getSimilarChats'));
    await screen.findByRole('alert');

    fireEvent.change(input, { target: { value: 'def456' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not show a table before any successful fetch', () => {
    render(<SimilarChatsDashboard lang="en" />);
    expect(screen.queryByRole('table')).toBeNull();
  });
});
