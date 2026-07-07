/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext.js';

const { mockGetCurrentUser, mockLogout, mockSetUnauthorizedCallback, mockGetSessionExpiresAt, mockNavigate } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockLogout: vi.fn(),
  mockSetUnauthorizedCallback: vi.fn(),
  mockGetSessionExpiresAt: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/en/admin' }),
  MemoryRouter: ({ children }) => React.createElement(React.Fragment, null, children),
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
  },
}));

vi.mock('../../utils/routes.js', () => ({
  getPath: (name, lang) => `/${lang}/${name}`,
}));

const AuthStatusProbe = () => {
  const { currentUser, loading } = useAuth();
  return (
    <div data-testid="auth-status">
      {loading ? 'loading' : currentUser ? 'signed-in' : 'signed-out'}
    </div>
  );
};

describe('AuthProvider session redirect', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T10:00:00Z'));
    mockGetCurrentUser.mockReset();
    mockLogout.mockReset();
    mockSetUnauthorizedCallback.mockReset();
    mockGetSessionExpiresAt.mockReset();
    mockNavigate.mockReset();
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

  it('redirects to signin with the session-expired reason when the timer fires', async () => {
    render(
      <AuthProvider>
        <AuthStatusProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status').textContent).toBe('signed-in');
    });

    await vi.advanceTimersByTimeAsync(1000);

    expect(mockNavigate).toHaveBeenCalledWith('/en/signin?reason=session-expired');
  });
});
