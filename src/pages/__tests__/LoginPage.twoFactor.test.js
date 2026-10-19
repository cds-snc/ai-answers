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

function submitPassword() {
  render(<LoginPage lang="en" />);
  fireEvent.change(screen.getByRole('textbox', { name: 'login.email' }), { target: { value: 'admin@example.com' } });
  fireEvent.change(screen.getByLabelText('login.password'), { target: { value: 'correct-password' } });
  fireEvent.submit(screen.getByRole('button', { name: 'login.submit' }).closest('form'));
}

async function reachTwoStep() {
  mockLogin.mockResolvedValue({ twoFA: true });
  submitPassword();
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
    // Nothing was typed, so the empty code field isn't flagged.
    expect(screen.getByRole('textbox', { name: 'login.2fa.code' }).getAttribute('aria-invalid')).toBe('false');
  });

  it.each([
    ['cooldown', 'login.2fa.cooldown'],
    ['locked', 'login.2fa.locked'],
    [null, 'login.2fa.sendError'],
  ])('moves focus to the status for a %s resend failure', async (reason, key) => {
    await reachTwoStep();
    mockSend2FA.mockImplementation(() => rejectWith(reason));
    fireEvent.click(screen.getByRole('button', { name: 'login.2fa.resend' }));
    await screen.findByText(key);
    await vi.waitFor(() => expect(document.activeElement.textContent).toContain(key));
  });

  it('moves focus again when the same resend failure repeats', async () => {
    await reachTwoStep();
    mockSend2FA.mockImplementation(() => rejectWith('cooldown'));
    const resend = screen.getByRole('button', { name: 'login.2fa.resend' });
    fireEvent.click(resend);
    await vi.waitFor(() => expect(document.activeElement.textContent).toContain('login.2fa.cooldown'));
    resend.focus();
    fireEvent.click(resend);
    await vi.waitFor(() => expect(document.activeElement.textContent).toContain('login.2fa.cooldown'));
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
    // Resend disables itself while sending, so focus must land on the confirmation.
    await vi.waitFor(() => expect(document.activeElement.textContent).toContain('login.2fa.resent'));
  });

  it('moves focus to the confirmation again on a second resend', async () => {
    await reachTwoStep();
    mockSend2FA.mockResolvedValue({ success: true });
    const resend = screen.getByRole('button', { name: 'login.2fa.resend' });
    fireEvent.click(resend);
    await vi.waitFor(() => expect(document.activeElement.textContent).toContain('login.2fa.resent'));
    resend.focus();
    fireEvent.click(resend);
    await vi.waitFor(() => expect(document.activeElement).not.toBe(resend));
    expect(document.activeElement.textContent).toContain('login.2fa.resent');
  });

  it('says the account is locked when verify is refused for that', async () => {
    await reachTwoStep();
    mockVerify2FA.mockImplementation(() => rejectWith('locked'));
    fireEvent.click(screen.getByRole('button', { name: 'login.2fa.verify' }));
    expect(await screen.findByText('login.2fa.locked')).toBeTruthy();
  });

  it.each([
    ['server_error', 'login.serverError'],
    ['network', 'login.networkError'],
  ])('does not call a %s on the code check a wrong code', async (reason, key) => {
    await reachTwoStep();
    mockVerify2FA.mockImplementation(() => rejectWith(reason));
    fireEvent.click(screen.getByRole('button', { name: 'login.2fa.verify' }));
    expect(await screen.findByText(key)).toBeTruthy();
    expect(screen.queryByText('login.2fa.invalidCode')).toBeNull();
    // A status, not a form error: the code field isn't flagged.
    expect(screen.getByRole('textbox', { name: 'login.2fa.code' }).getAttribute('aria-invalid')).toBe('false');
    await vi.waitFor(() => expect(document.activeElement.textContent).toContain(key));
  });

  it('says the connection failed when a resend gets no response', async () => {
    await reachTwoStep();
    mockSend2FA.mockImplementation(() => rejectWith('network'));
    fireEvent.click(screen.getByRole('button', { name: 'login.2fa.resend' }));
    expect(await screen.findByText('login.networkError')).toBeTruthy();
  });

  it('keeps "invalid code" for a wrong code', async () => {
    await reachTwoStep();
    mockVerify2FA.mockImplementation(() => rejectWith('invalid'));
    fireEvent.click(screen.getByRole('button', { name: 'login.2fa.verify' }));
    expect(await screen.findByText('login.2fa.invalidCode')).toBeTruthy();
  });

  it.each([
    ['locked', 'login.2fa.locked'],
    ['send_failed', 'login.2fa.sendError'],
    ['server_error', 'login.serverError'],
    ['network', 'login.networkError'],
  ])('explains a %s sign-in failure instead of blaming the password', async (reason, key) => {
    mockLogin.mockImplementation(() => rejectWith(reason));
    submitPassword();
    expect(await screen.findByText(key)).toBeTruthy();
    expect(screen.queryByText('login.invalidCredentials')).toBeNull();
    // The password was right, so neither field is flagged.
    expect(screen.getByRole('textbox', { name: 'login.email' }).getAttribute('aria-invalid')).toBe('false');
    expect(screen.getByRole('textbox', { name: 'login.email' }).getAttribute('aria-describedby')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement.textContent).toContain(key));
  });

  it('keeps one message for a wrong password, unknown email or password lockout', async () => {
    mockLogin.mockImplementation(() => rejectWith(null));
    submitPassword();
    expect(await screen.findByText('login.invalidCredentials')).toBeTruthy();
  });

  it.each([
    ['verify', () => mockVerify2FA, 'login.2fa.verify'],
    ['resend', () => mockSend2FA, 'login.2fa.resend'],
  ])('sends the user back to the password form when %s finds the sign-in expired', async (_name, getMock, button) => {
    await reachTwoStep();
    getMock().mockImplementation(() => rejectWith('expired'));
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(await screen.findByText('login.2fa.expired')).toBeTruthy();
    expect(screen.queryByText('login.2fa.sentToEmail')).toBeNull();
    expect(screen.getByLabelText('login.password').value).toBe('');
    expect(document.activeElement.textContent).toContain('login.2fa.expired');
  });
});
