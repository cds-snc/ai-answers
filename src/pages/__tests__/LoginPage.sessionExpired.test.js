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
  GcdsNotice: ({ children, noticeRole, noticeTitle, noticeTitleTag, className }) => (
    <section
      data-notice-role={noticeRole}
      data-notice-title={noticeTitle}
      data-notice-title-tag={noticeTitleTag}
      className={className}
    >
      {children}
    </section>
  ),
  GcdsText: ({ children }) => <div>{children}</div>,
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

    const notice = screen.getByText('Your session has expired. Please sign in again to continue.').closest('section');
    expect(notice).toBeTruthy();
    expect(notice?.getAttribute('data-notice-role')).toBe('warning');
    expect(notice?.getAttribute('data-notice-title')).toBe('Session expired');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
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
