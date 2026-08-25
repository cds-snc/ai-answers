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

    // role="status"/aria-live="polite" - was GcdsNotice, which renders no
    // role/aria-live at all (see status-and-error-messaging.md), so a
    // screen reader got no announcement here before this fix.
    const notice = screen.getByRole('status');
    expect(notice).toBeTruthy();
    expect(notice.getAttribute('aria-live')).toBe('polite');
    expect(notice.textContent).toContain('Session expired');
    expect(notice.textContent).toContain('Your session has expired. Please sign in again to continue.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('moves focus to the notice on mount, since there is no prior interaction to anchor to', () => {
    render(<LoginPage lang="en" />);

    const notice = screen.getByRole('status');
    expect(notice.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(notice);
  });

  it('allows valid credentials to log in while the expiry reason is present', async () => {
    mockLogin.mockResolvedValue({ defaultRoute: '/en/admin' });
    render(<LoginPage lang="en" />);

    fireEvent.change(screen.getByRole('textbox', { name: 'login.email' }), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('login.password'), { target: { value: 'correct-password' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin@example.com', 'correct-password');
      expect(mockNavigate).toHaveBeenCalledWith('/en/signin', { replace: true });
      expect(mockNavigate).toHaveBeenCalledWith('/en/admin');
    });
  });
});
