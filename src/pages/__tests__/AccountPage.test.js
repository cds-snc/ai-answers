/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccountPage from '../AccountPage.js';

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: (key) => key }),
}));

const { mockGetMe, mockUpdateMe, mockRefreshUser } = vi.hoisted(() => ({ mockGetMe: vi.fn(), mockUpdateMe: vi.fn(), mockRefreshUser: vi.fn() }));
vi.mock('../../services/UserService.js', () => ({ default: { getMe: mockGetMe, updateMe: mockUpdateMe } }));
vi.mock('../../contexts/AuthContext.js', () => ({ useAuth: () => ({ refreshUser: mockRefreshUser }) }));

vi.mock('datatables.net-react', () => {
  const MockDataTable = ({ columns, children }) => (
    <table data-testid="mock-datatable">{children}<thead><tr>{columns.map((c) => <th key={c.data}>{c.title}</th>)}</tr></thead></table>
  );
  MockDataTable.use = vi.fn();
  return { default: MockDataTable };
});
vi.mock('datatables.net-dt', () => ({ default: () => null }));
vi.mock('../../components/admin/ServerDataTable.js', () => ({
  default: ({ columns, fetchData }) => {
    React.useEffect(() => { fetchData({ start: 0, length: 10, search: '', orderBy: 'createdAt', orderDir: 'desc' }); }, [fetchData]);
    return <table data-testid="mock-server-table"><thead><tr>{columns.map((c) => <th key={c.data}>{c.title}</th>)}</tr></thead></table>;
  },
}));
const { mockGetChatDashboard } = vi.hoisted(() => ({ mockGetChatDashboard: vi.fn() }));
vi.mock('../../services/DashboardService.js', () => ({ default: { getChatDashboard: mockGetChatDashboard } }));
vi.mock('datatables.net-dt/css/dataTables.dataTables.css', () => ({}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <p>{children}</p>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsButton: ({ children, onClick, disabled }) => <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
  GcdsNotice: ({ children, noticeRole, noticeTitle, noticeTitleTag }) => (
    <section data-notice-role={noticeRole} data-notice-title={noticeTitle} data-notice-title-tag={noticeTitleTag}>
      {children}
    </section>
  ),
}));

describe('AccountPage', () => {
  afterEach(() => { cleanup(); mockGetMe.mockReset(); mockUpdateMe.mockReset(); mockRefreshUser.mockReset(); mockGetChatDashboard.mockReset(); });

  it('shows the signed-in user profile with institution and group (admin: both stay editable)', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'admin', active: true, institution: 'DND-MDN', group: 'Military transitions', createdAt: '2026-01-15T00:00:00.000Z' });
    render(<AccountPage lang="en" />);
    expect(await screen.findByText('a@dnd.ca')).toBeTruthy();
    expect(screen.getByText('users.roles.admin')).toBeTruthy();
    expect(screen.getByLabelText('account.institution').value).toBe('DND-MDN');
    expect(screen.getByLabelText('account.group').value).toBe('Military transitions');
    expect(screen.getByText('account.accountName')).toBeTruthy();
    // Both group-chats and assigned-chats now render via ServerDataTable.
    expect(screen.getAllByTestId('mock-server-table').length).toBeGreaterThan(0);
    expect(screen.getByText('account.assignedChats.columns.assignedOn')).toBeTruthy();
    expect(screen.getByText('account.assignedChats.columns.assignedBy')).toBeTruthy();
    expect(screen.getAllByText('admin.common.columns.program').length).toBeGreaterThan(0);
    expect(screen.getByText('account.assignedChats.columns.evaluated')).toBeTruthy();
    expect(screen.getByText('account.assignedChats.columns.partnerNotes')).toBeTruthy();
    expect(screen.queryByText('admin.common.columns.department')).toBeNull();
    expect(screen.getByRole('link', { name: 'common.backToAdmin' }).getAttribute('href')).toBe('/en/admin');
  });

  it('defaults the dropdowns to "not set" / "none" when unassigned', async () => {
    mockGetMe.mockResolvedValue({ email: 'b@x.ca', role: 'admin', institution: '', group: '' });
    render(<AccountPage lang="en" />);
    const institution = await screen.findByLabelText('account.institution');
    expect(institution.value).toBe('');
    expect(institution.options[0].textContent).toBe('users.institutionNone');
    expect(screen.getByLabelText('account.group').options[0].textContent).toBe('users.groupNone');
  });

  it('stages a self-picked institution until Save, then saves it, refreshes the auth user and moves focus to the outcome', async () => {
    mockGetMe.mockResolvedValue({ email: 'b@x.ca', role: 'partner', institution: '', group: '' });
    mockUpdateMe.mockResolvedValue({ email: 'b@x.ca', role: 'partner', institution: 'IRCC', group: '' });
    mockRefreshUser.mockResolvedValue();
    render(<AccountPage lang="en" />);
    const institution = await screen.findByLabelText('account.institution');
    const save = screen.getByRole('button', { name: 'users.actions.save' });
    expect(save.disabled).toBe(true);
    // Changing the select (what an arrow key on a closed select does in
    // Chrome/Firefox) must not save - for a partner the first save locks it.
    fireEvent.change(institution, { target: { value: 'IRCC' } });
    expect(mockUpdateMe).not.toHaveBeenCalled();
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(mockUpdateMe).toHaveBeenCalledWith({ institution: 'IRCC' }));
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
    const outcome = await screen.findByText('account.updated');
    expect(outcome.closest('.status-message--success-box')).toBeTruthy();
    // Save disables itself once nothing is dirty, so focus lands on the message.
    await waitFor(() => expect(document.activeElement).toBe(outcome));
    expect(outcome.getAttribute('data-announced-via')).toBe('focus');
  });

  it('sends both fields in one PATCH when both were changed', async () => {
    mockGetMe.mockResolvedValue({ email: 'b@x.ca', role: 'admin', institution: 'IRCC', group: '' });
    mockUpdateMe.mockResolvedValue({ email: 'b@x.ca', role: 'admin', institution: 'DND-MDN', group: 'Military transitions' });
    mockRefreshUser.mockResolvedValue();
    render(<AccountPage lang="en" />);
    fireEvent.change(await screen.findByLabelText('account.institution'), { target: { value: 'DND-MDN' } });
    fireEvent.change(screen.getByLabelText('account.group'), { target: { value: 'Military transitions' } });
    fireEvent.click(screen.getByRole('button', { name: 'users.actions.save' }));
    await waitFor(() => expect(mockUpdateMe).toHaveBeenCalledTimes(1));
    expect(mockUpdateMe).toHaveBeenCalledWith({ institution: 'DND-MDN', group: 'Military transitions' });
  });

  it('renders a locked institution/group read-only with the admin hint, and no Save button, for a partner', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: 'Military transitions' });
    render(<AccountPage lang="en" />);
    expect(await screen.findByText('DND-MDN')).toBeTruthy();
    expect(screen.getByText('Military transitions')).toBeTruthy();
    expect(screen.getByText('account.institutionLocked')).toBeTruthy();
    expect(screen.getByText('account.groupLocked')).toBeTruthy();
    expect(screen.queryByLabelText('account.institution')).toBeNull();
    expect(screen.queryByLabelText('account.group')).toBeNull();
    expect(screen.queryByRole('button', { name: 'users.actions.save' })).toBeNull();
  });

  it('keeps an unset field editable for a partner while the set one is locked', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: '' });
    render(<AccountPage lang="en" />);
    expect(await screen.findByText('account.institutionLocked')).toBeTruthy();
    expect(screen.getByLabelText('account.group').tagName).toBe('SELECT');
    expect(screen.getByRole('button', { name: 'users.actions.save' })).toBeTruthy();
  });

  it('shows the French group label in the French UI', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'admin', institution: '', group: 'Military transitions' });
    render(<AccountPage lang="fr" />);
    const group = await screen.findByLabelText('account.group');
    expect(group.value).toBe('Military transitions');
    expect(group.selectedOptions[0].textContent).toBe('Transitions militaires');
  });

  it('moves focus to the load error and hides profile/activity content', async () => {
    mockGetMe.mockRejectedValue(new Error('nope'));
    render(<AccountPage lang="en" />);
    const message = await screen.findByText('account.loadError');
    await waitFor(() => expect(document.activeElement).toBe(message));
    expect(message.getAttribute('data-announced-via')).toBe('focus');
    // Nothing that depends on the profile (preferences, activity/assigned
    // chats) should render when it failed to load.
    // account.assignedChats.heading is now sr-only (ServerDataTable's
    // `caption` prop, mocked away in this test's DataTable mock) rather
    // than a visible heading - activityHeading is the meaningful check
    // that the whole assigned-chats section didn't render.
    expect(screen.queryByText('account.activityHeading')).toBeNull();
  });
});
