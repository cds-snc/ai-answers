/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../AuthContext.js';

const { mockGetCurrentUser, mockLogout, mockSetUnauthorizedCallback, mockGetSessionExpiresAt } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockLogout: vi.fn(),
  mockSetUnauthorizedCallback: vi.fn(),
  mockGetSessionExpiresAt: vi.fn(() => null),
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

describe('AuthProvider session revalidation', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    mockGetCurrentUser.mockReset();
    mockLogout.mockReset();
    mockSetUnauthorizedCallback.mockReset();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockGetCurrentUser
      .mockResolvedValueOnce({ userId: 'abc', role: 'admin' })
      .mockResolvedValueOnce(null);

    mockLogout.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  it('clears the auth state and logs out when a focused tab finds an expired session', async () => {
    render(
      <MemoryRouter initialEntries={['/en/admin']}>
        <AuthProvider>
          <AuthStatusProbe />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status').textContent).toBe('signed-in');
    });

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => {
      expect(mockGetCurrentUser).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('auth-status').textContent).toBe('signed-out');
    });

    expect(mockSetUnauthorizedCallback).toHaveBeenCalled();
  });

  it('does not revalidate or redirect while the user is on the public chat page', async () => {
    render(
      <MemoryRouter initialEntries={['/en']}>
        <AuthProvider>
          <AuthStatusProbe />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status').textContent).toBe('signed-in');
    });

    window.dispatchEvent(new Event('focus'));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockGetCurrentUser).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
  });
});
