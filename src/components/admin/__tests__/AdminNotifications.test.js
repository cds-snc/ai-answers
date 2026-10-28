/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import AdminNotifications from '../AdminNotifications.js';

vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: (key) => `${key} {count}` }),
}));
vi.mock('@gcds-core/components-react', () => ({
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));
const { mockGetStats } = vi.hoisted(() => ({ mockGetStats: vi.fn() }));
vi.mock('../../../services/UserService.js', () => ({ default: { getStats: mockGetStats } }));

describe('AdminNotifications', () => {
  afterEach(() => { cleanup(); mockGetStats.mockReset(); });

  it('shows a partner one box: the pending count is the link text, linked to the filtered account page', async () => {
    mockGetStats.mockResolvedValue({ pendingAssignedCount: 3 });
    render(<AdminNotifications lang="en" />);
    const link = await screen.findByRole('link', { name: 'admin.notifications.pendingAssignedOther 3' });
    expect(link.getAttribute('href')).toBe('/en/account?show=pending');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['admin.notifications.assignedHeading {count}']);
  });

  it('uses the singular text for one', async () => {
    mockGetStats.mockResolvedValue({ pendingAssignedCount: 1 });
    render(<AdminNotifications lang="en" />);
    await screen.findByRole('link', { name: 'admin.notifications.pendingAssignedOne 1' });
  });

  it('shows an admin two boxes, each account link filtered to what it counts', async () => {
    mockGetStats.mockResolvedValue({ pendingAssignedCount: 2, newInactiveCount: 1, totalInactiveCount: 4 });
    render(<AdminNotifications lang="en" />);
    await screen.findByRole('link', { name: 'admin.notifications.pendingAssignedOther 2' });
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'admin.notifications.newInactiveOne 1' }).getAttribute('href')).toBe('/en/users?show=new');
    expect(screen.getByRole('link', { name: 'admin.notifications.totalInactiveOther 4' }).getAttribute('href')).toBe('/en/users?show=inactive');
  });

  it('shows only the accounts box when nothing is assigned', async () => {
    mockGetStats.mockResolvedValue({ pendingAssignedCount: 0, newInactiveCount: 0, totalInactiveCount: 4 });
    render(<AdminNotifications lang="en" />);
    await screen.findByRole('link', { name: 'admin.notifications.totalInactiveOther 4' });
    expect(screen.queryByRole('link', { name: /pendingAssigned/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /newInactive/ })).toBeNull();
  });
});
