/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../AuthContext.js';

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
  },
}));

vi.mock('../../utils/routes.js', () => ({
  getPath: (name, lang) => `/${lang}/${name}`,
}));

const AuthStatusProbe = () => {
  const { currentUser, sessionWarningVisible } = useAuth();
  return (
    <div>
      <div data-testid="auth-status">
        {currentUser ? 'signed-in' : 'signed-out'}
      </div>
      <div data-testid="session-warning">
        {sessionWarningVisible ? 'warning' : 'clear'}
      </div>
    </div>
  );
};

describe('AuthProvider session warning timer', () => {
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
    mockGetSessionExpiresAt.mockReturnValue(Date.now() + 120000);
    mockLogout.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
    vi.useRealTimers();
  });

  it('shows a warning one minute before expiry and logs out automatically without user interaction', async () => {
    render(
      <MemoryRouter initialEntries={['/en/admin']}>
        <AuthProvider>
          <AuthStatusProbe />
        </AuthProvider>
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('auth-status').textContent).toBe('signed-in');

    expect(screen.getByTestId('session-warning').textContent).toBe('clear');

    await act(async () => {
      vi.advanceTimersByTime(60000);
      await Promise.resolve();
    });

    expect(screen.getByTestId('session-warning').textContent).toBe('warning');
    expect(mockLogout).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(60000);
      await Promise.resolve();
    });

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
