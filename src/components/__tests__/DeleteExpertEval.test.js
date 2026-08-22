/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DeleteExpertEval from '../DeleteExpertEval.js';

const TRANSLATIONS = {
  'admin.deleteExpertEval.title': 'Delete an expert evaluation',
  'admin.deleteExpertEval.idLabel': 'Chat ID',
  'admin.deleteExpertEval.button': 'Delete expert evaluation',
  'admin.deleteExpertEval.loading': 'Deleting...',
  'admin.deleteExpertEval.error': 'Failed to delete expert evaluation: {message}',
  'admin.deleteExpertEval.notEvaluated': 'Not evaluated.',
  'common.confirmDelete': 'Are you sure you want to delete this data?',
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockDeleteExpertEval } = vi.hoisted(() => ({ mockDeleteExpertEval: vi.fn() }));
vi.mock('../../services/EvaluationService.js', () => ({
  default: { deleteExpertEval: mockDeleteExpertEval },
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

describe('DeleteExpertEval error/success announcements', () => {
  afterEach(() => {
    cleanup();
    mockDeleteExpertEval.mockReset();
    vi.restoreAllMocks();
  });

  const startDelete = () => {
    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByText('Delete expert evaluation'));
  };

  it('asks for confirmation via window.confirm before deleting', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDeleteExpertEval.mockResolvedValue({ message: 'Deleted 1 expert feedback(s) for chat abc123', deletedCount: 1 });

    render(<DeleteExpertEval lang="en" />);
    startDelete();

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this data?');
    await screen.findByRole('status');
  });

  it('does not delete when the confirmation dialog is cancelled', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<DeleteExpertEval lang="en" />);
    startDelete();

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockDeleteExpertEval).not.toHaveBeenCalled();
  });

  it('announces a successful delete (deletedCount > 0) as role="status"', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDeleteExpertEval.mockResolvedValue({ message: 'Deleted 1 expert feedback(s) for chat abc123', deletedCount: 1 });

    render(<DeleteExpertEval lang="en" />);
    startDelete();

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Deleted 1 expert feedback(s) for chat abc123');
    expect(status.className).toContain('status-message--success-box');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('treats deletedCount: 0 as an error ("Not evaluated"), not a success', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDeleteExpertEval.mockResolvedValue({ message: 'Deleted 0 expert feedback(s) for chat abc123', deletedCount: 0 });

    render(<DeleteExpertEval lang="en" />);
    startDelete();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Failed to delete expert evaluation: Not evaluated.');
    // "Not evaluated" is a known translated reason, not raw exception text —
    // shouldn't get the lang="en" pronunciation wrapper.
    expect(alert.querySelector('span[lang="en"]')).toBeNull();
  });

  it('announces a chat that doesn\'t exist (API 404 "Chat not found") in a lang="en" span, inside role="alert"', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    // Mirrors what EvaluationService.deleteExpertEval actually throws when
    // the API returns 404 — services/EvaluationService.js:89, `{ error:
    // 'Chat not found', status: 404 }` — not a generic network failure.
    mockDeleteExpertEval.mockRejectedValue(new Error('Chat not found'));

    render(<DeleteExpertEval lang="fr" />);
    startDelete();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Failed to delete expert evaluation: Chat not found');

    const enSpan = alert.querySelector('span[lang="en"]');
    expect(enSpan).toBeTruthy();
    expect(enSpan.textContent).toBe('Chat not found');
  });

  it('wraps a generic network/server error in a lang="en" span too', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDeleteExpertEval.mockRejectedValue(new Error('Failed to fetch'));

    render(<DeleteExpertEval lang="fr" />);
    startDelete();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Failed to delete expert evaluation: Failed to fetch');
    expect(alert.querySelector('span[lang="en"]')).toBeTruthy();
  });

  it('clears a stale result message as soon as the admin edits the chat ID again', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDeleteExpertEval.mockRejectedValue(new Error('Chat not found'));

    render(<DeleteExpertEval lang="en" />);
    startDelete();
    await screen.findByRole('alert');

    fireEvent.change(screen.getByLabelText('Chat ID'), { target: { value: 'def456' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
