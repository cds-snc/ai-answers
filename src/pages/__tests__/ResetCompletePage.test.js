/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ResetCompletePage from '../ResetCompletePage.js';
import AuthService from '../../services/AuthService.js';
import { waitForAnnouncement } from '../../../test/liveAnnouncer.js';

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
    await vi.waitFor(() => expect(document.activeElement.textContent).toContain('reset.complete.invalid'));
  });

  // Focus stays on the submit button, so the message has to be announced.
  it('announces a refused link after submit', async () => {
    mockSearch = 'email=admin%40example.com&code=abc123';
    AuthService.resetPassword.mockRejectedValue(Object.assign(new Error('x'), { code: 'RESET_INVALID_CODE' }));
    render(<ResetCompletePage lang="en" />);
    submitNewPassword();
    await waitForAnnouncement('reset.complete.invalidCode', 'assertive');
    const status = screen.getByText('reset.complete.invalidCode');
    expect(status.closest('[data-announced-via="live-announcer-assertive"]')).toBeTruthy();
  });
});
