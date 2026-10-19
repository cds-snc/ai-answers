/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import ResetVerifyPage from '../ResetVerifyPage.js';

let mockSearch = '';

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }) => React.createElement('a', { href: to }, children),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(mockSearch)],
}));

// Keys come back as-is, so assertions name the locale key shown.
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: (key) => key }),
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsIcon: (props) => React.createElement('span', { ...props, 'data-gcds-icon': true, 'aria-hidden': 'true' }),
}));

describe('ResetVerifyPage', () => {
  afterEach(() => {
    cleanup();
    mockSearch = '';
  });

  it('shows a broken link as a status and moves focus to it', async () => {
    mockSearch = 'email=admin%40example.com';
    render(<ResetVerifyPage lang="en" />);
    const status = await screen.findByText('reset.verify.invalidLink');
    expect(status.closest('[data-announced-via="focus"]')).toBeTruthy();
    await vi.waitFor(() => expect(document.activeElement.textContent).toContain('reset.verify.invalidLink'));
    expect(screen.queryByRole('button', { name: 'reset.verify.continue' })).toBeNull();
  });

  it('shows the continue step for a complete link', async () => {
    mockSearch = 'email=admin%40example.com&code=abc123';
    render(<ResetVerifyPage lang="en" />);
    expect(await screen.findByRole('button', { name: 'reset.verify.continue' })).toBeTruthy();
    expect(screen.queryByText('reset.verify.invalidLink')).toBeNull();
  });
});
