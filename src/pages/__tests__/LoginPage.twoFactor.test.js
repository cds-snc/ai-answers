/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mockLogin = vi.fn();
const mockSend2FA = vi.fn();
const mockVerify2FA = vi.fn();
import LoginPage from '../LoginPage.js';

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
  useLocation: () => ({ pathname: '/en/signin', search: '' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    login: mockLogin,
    refreshUser: vi.fn(),
    getDefaultRouteForRole: vi.fn(() => '/en/admin'),
  }),
}));

vi.mock('../../services/AuthService.js', () => ({
  default: {
    send2FA: (...args) => mockSend2FA(...args),
    verify2FA: (...args) => mockVerify2FA(...args),
  },
}));

// Keys come back as-is, so assertions name the locale key shown.
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: (key) => key }),
}));

vi.mock('@gcds-core/components-react', () => ({
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

function rejectWith(reason) {
  const err = new Error('failed');
  err.reason = reason;
  return Promise.reject(err);
}

async function reachTwoStep() {
  mockLogin.mockResolvedValue({ twoFA: true });
  render(<LoginPage lang="en" />);
  fireEvent.change(screen.getByRole('textbox', { name: 'login.email' }), { target: { value: 'admin@example.com' } });
  fireEvent.change(screen.getByLabelText('login.password'), { target: { value: 'correct-password' } });
  fireEvent.submit(screen.getByRole('button', { name: 'login.submit' }).closest('form'));
  await screen.findByText('login.2fa.sentToEmail');
}

describe('LoginPage two-step messages', () => {
  afterEach(() => {
    cleanup();
    mockLogin.mockReset();
    mockSend2FA.mockReset();
    mockVerify2FA.mockReset();
  });

  it('tells the user to wait when a resend is inside the cooldown', async () => {
    await reachTwoStep();
    mockSend2FA.mockImplementation(() => rejectWith('cooldown'));
    fireEvent.click(screen.getByRole('button', { name: 'login.2fa.resend' }));
    expect(await screen.findByText('login.2fa.cooldown')).toBeTruthy();
    expect(screen.queryByText('login.2fa.sendError')).toBeNull();
  });

  it('says the account is locked when a resend is refused for that', async () => {
    await reachTwoStep();
    mockSend2FA.mockImplementation(() => rejectWith('locked'));
    fireEvent.click(screen.getByRole('button', { name: 'login.2fa.resend' }));
    expect(await screen.findByText('login.2fa.locked')).toBeTruthy();
  });

  it('falls back to the generic send error for anything else', async () => {
    await reachTwoStep();
    mockSend2FA.mockImplementation(() => rejectWith(null));
    fireEvent.click(screen.getByRole('button', { name: 'login.2fa.resend' }));
    expect(await screen.findByText('login.2fa.sendError')).toBeTruthy();
  });

  it('confirms a successful resend', async () => {
    await reachTwoStep();
    mockSend2FA.mockResolvedValue({ success: true });
    fireEvent.click(screen.getByRole('button', { name: 'login.2fa.resend' }));
    const confirmation = await screen.findByText('login.2fa.resent');
    expect(confirmation.closest('.status-message--success-box')).toBeTruthy();
  });

  it('says the account is locked when verify is refused for that', async () => {
    await reachTwoStep();
    mockVerify2FA.mockImplementation(() => rejectWith('locked'));
    fireEvent.click(screen.getByRole('button', { name: 'login.2fa.verify' }));
    expect(await screen.findByText('login.2fa.locked')).toBeTruthy();
  });

  it('keeps "invalid code" for a wrong code', async () => {
    await reachTwoStep();
    mockVerify2FA.mockImplementation(() => rejectWith('invalid'));
    fireEvent.click(screen.getByRole('button', { name: 'login.2fa.verify' }));
    expect(await screen.findByText('login.2fa.invalidCode')).toBeTruthy();
  });
});
