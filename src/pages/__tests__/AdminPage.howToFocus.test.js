/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from '../AdminPage.js';

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: (key) => key }),
}));
vi.mock('../../contexts/AuthContext.js', () => ({ useAuth: mockUseAuth }));
vi.mock('../../components/RoleBasedUI.js', () => ({
  RoleBasedContent: ({ children }) => <>{children}</>,
}));
vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
}));
vi.mock('../../components/admin/ChatLogsDashboard.js', () => ({ default: () => null }));
vi.mock('../../components/admin/ViewChatByIdSection.js', () => ({ default: () => null }));
vi.mock('../../components/admin/DeleteChatSection.js', () => ({ default: () => null }));
vi.mock('../../components/DeleteExpertEval.js', () => ({ default: () => null }));
vi.mock('../../components/admin/AdminNotifications.js', () => ({ default: () => null }));

const nextFrames = () => act(() => new Promise((resolve) => setTimeout(resolve, 100)));

const renderAdminPage = () => render(
  <MemoryRouter initialEntries={['/en/admin#how-to-guides']}>
    <AdminPage lang="en" />
  </MemoryRouter>
);

describe('AdminPage footer How to guides arrival', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/en/admin#how-to-guides');
    mockUseAuth.mockReturnValue({ logout: vi.fn(), currentUser: { role: 'admin' } });
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('focuses the How to guides heading on arrival', async () => {
    renderAdminPage();
    await waitFor(() => expect(document.activeElement?.id).toBe('how-to-guides'));
  });

  it('does not pull focus back when the session re-check replaces currentUser', async () => {
    const { rerender } = renderAdminPage();
    await waitFor(() => expect(document.activeElement?.id).toBe('how-to-guides'));

    // User moves on, then returns to the tab: AuthContext's revalidateSession
    // sets a new currentUser object.
    const logout = screen.getByRole('button', { name: 'admin.navigation.logout' });
    logout.focus();
    mockUseAuth.mockReturnValue({ logout: vi.fn(), currentUser: { role: 'admin' } });
    rerender(
      <MemoryRouter initialEntries={['/en/admin#how-to-guides']}>
        <AdminPage lang="en" />
      </MemoryRouter>
    );
    await nextFrames();

    expect(document.activeElement).toBe(logout);
  });
});
