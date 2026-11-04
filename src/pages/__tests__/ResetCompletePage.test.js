/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ResetCompletePage from '../ResetCompletePage.js';
import AuthService from '../../services/AuthService.js';
import { announce } from '../../utils/liveAnnouncer.js';

let mockSearch = '';

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
  useSearchParams: () => [new URLSearchParams(mockSearch)],
}));

// Keys come back as-is, so assertions name the locale key shown. One `t` for
// every render, like the real hook: the page's link check depends on it.
vi.mock('../../hooks/useTranslations.js', () => {
  const t = (key) => key;
  return { useTranslations: () => ({ t }) };
});

// Real announcer, wrapped so a test can check a message was never queued.
vi.mock('../../utils/liveAnnouncer.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, announce: vi.fn(actual.announce) };
});

vi.mock('../../services/AuthService.js', () => ({
  default: { resetPassword: vi.fn() },
}));

const PASSWORD = 'a-long-enough-password-1';

function submitNewPassword() {
  fireEvent.change(screen.getByLabelText('reset.complete.password'), { target: { value: PASSWORD } });
  fireEvent.change(screen.getByLabelText('reset.complete.confirm'), { target: { value: PASSWORD } });
  fireEvent.click(screen.getByRole('button', { name: 'reset.complete.submit' }));
}

describe('ResetCompletePage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockSearch = '';
  });

  it('moves focus to a broken link message instead of announcing it', async () => {
    mockSearch = 'email=admin%40example.com';
    render(<ResetCompletePage lang="en" />);
    const status = await screen.findByText('reset.complete.invalid');
    expect(status.closest('[data-announced-via="focus"]')).toBeTruthy();
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByText('reset.complete.invalid').closest('[data-announced-via]')));
  });

  it('offers a new link when the link is broken on load', async () => {
    mockSearch = 'email=admin%40example.com';
    render(<ResetCompletePage lang="en" />);
    expect(await screen.findByRole('link', { name: 'reset.complete.requestNewLink' })).toBeTruthy();
  });

  // A refused link never works again: the form goes, focus moves to the
  // message (the focused button is gone), and the page offers a new link.
  it('hides the form and points to a new link when the server refuses the link', async () => {
    mockSearch = 'email=admin%40example.com&code=abc123';
    AuthService.resetPassword.mockRejectedValue(Object.assign(new Error('x'), { code: 'RESET_INVALID_CODE' }));
    render(<ResetCompletePage lang="en" />);
    expect(screen.queryByRole('link', { name: 'reset.complete.requestNewLink' })).toBeNull();
    submitNewPassword();
    const status = await screen.findByText('reset.complete.invalidCode');
    expect(status.closest('[data-announced-via="focus"]')).toBeTruthy();
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByText('reset.complete.invalidCode').closest('[data-announced-via]')));
    // Focus reads it; an announcement on top would be a double read.
    expect(announce).not.toHaveBeenCalledWith('reset.complete.invalidCode', expect.anything());
    expect(announce).not.toHaveBeenCalledWith('reset.complete.invalidCode');
    expect(screen.queryByRole('button', { name: 'reset.complete.submit' })).toBeNull();
    expect(screen.getByRole('link', { name: 'reset.complete.requestNewLink' })).toBeTruthy();
  });

  // The submit button is disabled while the request runs, which drops focus,
  // so a failure the user can retry still moves focus to its message, keeps
  // the form, and does it again on a repeat failure with the same text.
  it('focuses other submit errors, keeps the form, and refocuses on a repeat', async () => {
    mockSearch = 'email=admin%40example.com&code=abc123';
    AuthService.resetPassword.mockRejectedValue(new Error('network'));
    render(<ResetCompletePage lang="en" />);
    submitNewPassword();
    const status = await screen.findByText('reset.complete.error');
    expect(status.closest('[data-announced-via="focus"]')).toBeTruthy();
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByText('reset.complete.error').closest('[data-announced-via]')));
    expect(screen.getByRole('button', { name: 'reset.complete.submit' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'reset.complete.requestNewLink' })).toBeNull();

    screen.getByRole('button', { name: 'reset.complete.submit' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'reset.complete.submit' }));
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByText('reset.complete.error').closest('[data-announced-via]')));
    expect(AuthService.resetPassword).toHaveBeenCalledTimes(2);
    expect(announce).not.toHaveBeenCalledWith('reset.complete.error', expect.anything());
  });

  // Success hides the form, so focus moves to the success message.
  it('moves focus to the success message', async () => {
    mockSearch = 'email=admin%40example.com&code=abc123';
    AuthService.resetPassword.mockResolvedValue({ success: true });
    render(<ResetCompletePage lang="en" />);
    submitNewPassword();
    const status = await screen.findByText('reset.complete.success');
    expect(status.closest('[data-announced-via="focus"]')).toBeTruthy();
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByText('reset.complete.success').closest('[data-announced-via]')));
    expect(announce).not.toHaveBeenCalledWith('reset.complete.success', expect.anything());
    expect(screen.queryByRole('button', { name: 'reset.complete.submit' })).toBeNull();
  });
});
