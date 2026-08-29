/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockLogin = vi.fn();
const mockNavigate = vi.fn();
import LoginPage from '../LoginPage.js';

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
  useLocation: () => ({ pathname: '/en/signin', search: '?reason=session-expired' }),
  useNavigate: () => mockNavigate,
}));

vi.mock('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    login: mockLogin,
    refreshUser: vi.fn(),
    getDefaultRouteForRole: vi.fn(() => '/en/admin'),
  }),
}));

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key, defaultValue) => ({
      'login.sessionExpired.title': 'Session expired',
      'login.sessionExpired.message': 'Your session has expired. Please sign in again to continue.',
      'login.submit': 'Sign in',
    }[key] || defaultValue || key),
  }),
}));

vi.mock('@gcds-core/components-react', () => ({
  // Real StatusMessage (not mocked below) renders a GcdsIcon internally for
  // variant="warning" - stub it the same way StatusMessage.test.js does.
  GcdsIcon: (props) => React.createElement('span', { ...props, 'data-gcds-icon': true, 'aria-hidden': 'true' }),
}));

vi.mock('../../components/auth/PasswordInput.js', () => ({
  default: ({ label, ...props }) => (
    <label>
      {label}
      <input type="password" {...props} />
    </label>
  ),
}));

describe('LoginPage session expired notice', () => {
  afterEach(() => {
    cleanup();
    mockLogin.mockReset();
    mockNavigate.mockReset();
  });

  it('shows a warning when redirected after a session check fails', () => {
    render(<LoginPage lang="en" />);

    // A StatusMessage warning box - was GcdsNotice, which had no
    // accessibility wiring at all (see status-and-error-messaging.md).
    // Focus is moved onto it on mount (next test), which reads it, so it's
    // deliberately not also live-announced (announce={false}).
    const notice = screen.getByText('Session expired').closest('.status-message--warning-box');
    expect(notice).toBeTruthy();
    expect(notice.textContent).toContain('Session expired');
    expect(notice.textContent).toContain('Your session has expired. Please sign in again to continue.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('moves focus to the notice on mount, since there is no prior interaction to anchor to', () => {
    render(<LoginPage lang="en" />);

    const notice = screen.getByText('Session expired').closest('.status-message--warning-box');
    expect(notice.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(notice);
  });

  it('allows valid credentials to log in while the expiry reason is present', async () => {
    mockLogin.mockResolvedValue({ defaultRoute: '/en/admin' });
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(<LoginPage lang="en" />);

    fireEvent.change(screen.getByRole('textbox', { name: 'login.email' }), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('login.password'), { target: { value: 'correct-password' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin@example.com', 'correct-password');
      // The only navigation is to the landing page. The expiry marker is
      // cleaned with history.replaceState, not navigate(): a router
      // navigation mid-submit would move focus to <main> and announce
      // "Sign in" before the user has landed anywhere.
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/en/admin');
    });
    expect(mockNavigate).not.toHaveBeenCalledWith('/en/signin', expect.anything());
    // Marker gone from the URL, notice gone from the page.
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls[0].slice(1)).toEqual(['', '/en/signin']);
    replaceState.mockRestore();
    expect(screen.queryByText('login.sessionExpired.title')).toBeNull();
  });
});
