/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../AuthContext.js';
import { RoleProtectedRoute } from '../../components/RoleProtectedRoute.js';
import LoginPage from '../../pages/LoginPage.js';

const { mockGetCurrentUser, mockLogout, mockSetUnauthorizedCallback, mockGetSessionExpiresAt } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockLogout: vi.fn(),
  mockSetUnauthorizedCallback: vi.fn(),
  mockGetSessionExpiresAt: vi.fn(),
}));

vi.mock('../../services/AuthService.js', () => ({
  default: {
    getCurrentUser: mockGetCurrentUser,
    logout: mockLogout,
    setUnauthorizedCallback: mockSetUnauthorizedCallback,
    login: vi.fn(),
    signup: vi.fn(),
    clearClientStorage: vi.fn(),
    getSessionExpiresAt: mockGetSessionExpiresAt,
    verify2FA: vi.fn(),
    send2FA: vi.fn(),
  },
}));

vi.mock('../../utils/routes.js', () => ({
  getPath: (name, lang) => `/${lang}/${name}`,
}));

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key, defaultValue) => ({
      'login.sessionExpired.title': 'Session expired',
      'login.sessionExpired.message': 'Your session has expired. Please sign in again to continue.',
      'login.title': 'Sign in',
      'login.email': 'Email',
      'login.password': 'Password',
      'login.submit': 'Sign in',
      'login.form.submitting': 'Signing in...',
      'login.form.signupLink': 'Create an account',
      'login.form.forgotPassword': 'Forgot password?',
    }[key] || defaultValue || key),
  }),
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsNotice: ({ children, noticeRole, noticeTitle }) => (
    <section data-notice-role={noticeRole}>
      <h2>{noticeTitle}</h2>
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

const AdminPage = () => <div>Protected admin</div>;

describe('AuthProvider protected route expiry redirect', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T10:00:00Z'));
    mockGetCurrentUser.mockReset();
    mockLogout.mockReset();
    mockSetUnauthorizedCallback.mockReset();
    mockGetSessionExpiresAt.mockReset();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockGetCurrentUser.mockResolvedValue({ userId: 'abc', role: 'admin' });
    mockGetSessionExpiresAt.mockReturnValue(Date.now() + 1000);
    mockLogout.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
    vi.useRealTimers();
  });

  it('shows the session expired notice after auto signout from a protected route', async () => {
    render(
      <MemoryRouter initialEntries={['/en/admin']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/en/admin"
              element={(
                <RoleProtectedRoute roles={['admin']} lang="en">
                  <AdminPage />
                </RoleProtectedRoute>
              )}
            />
            <Route path="/en/signin" element={<LoginPage lang="en" />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Protected admin')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(screen.getByText('Your session has expired. Please sign in again to continue.')).toBeTruthy();
  });
});
