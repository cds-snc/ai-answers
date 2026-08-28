/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccountPage from '../AccountPage.js';

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: (key) => (key === 'account.groupChats.heading' ? '{group} chats and reviews' : key) }),
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
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

describe('AccountPage', () => {
  afterEach(() => { cleanup(); mockGetMe.mockReset(); mockUpdateMe.mockReset(); mockRefreshUser.mockReset(); mockGetChatDashboard.mockReset(); });

  it('shows the signed-in user profile with institution and group', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', active: true, institution: 'DND-MDN', group: 'Military transitions', createdAt: '2026-01-15T00:00:00.000Z' });
    render(<AccountPage lang="en" />);
    expect(await screen.findByText('a@dnd.ca')).toBeTruthy();
    expect(screen.getByText('users.roles.partner')).toBeTruthy();
    expect(screen.getByLabelText('account.institution').value).toBe('DND-MDN');
    expect(screen.getByLabelText('account.group').value).toBe('Military transitions');
    expect(screen.getByText('account.accountName')).toBeTruthy();
    expect(screen.getByText('users.status.active')).toBeTruthy();
    // Assigned-chats placeholder table renders with its column shape
    expect(screen.getByTestId('mock-datatable')).toBeTruthy();
    expect(screen.getByText('account.assignedChats.columns.assignedOn')).toBeTruthy();
    expect(screen.getByText('account.assignedChats.columns.assignedBy')).toBeTruthy();
    expect(screen.getAllByText('admin.common.columns.program').length).toBeGreaterThan(0);
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

  it('saves a self-picked institution and refreshes the auth user', async () => {
    mockGetMe.mockResolvedValue({ email: 'b@x.ca', role: 'partner', institution: '', group: '', preferences: { prefilterDepartment: false } });
    mockUpdateMe.mockResolvedValue({ email: 'b@x.ca', role: 'partner', institution: 'IRCC', group: '', preferences: { prefilterDepartment: false } });
    mockRefreshUser.mockResolvedValue();
    render(<AccountPage lang="en" />);
    const institution = await screen.findByLabelText('account.institution');
    fireEvent.change(institution, { target: { value: 'IRCC' } });
    await waitFor(() => expect(mockUpdateMe).toHaveBeenCalledWith({ institution: 'IRCC' }));
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
    expect(screen.getByText('account.profileSaved').closest('[role="status"]')).toBeTruthy();
  });

  it('saves the pre-filter preference and refreshes the auth user', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: '', preferences: { prefilterDepartment: false } });
    mockUpdateMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: '', preferences: { prefilterDepartment: true } });
    mockRefreshUser.mockResolvedValue();
    render(<AccountPage lang="en" />);
    const checkbox = await screen.findByLabelText('account.preferences.prefilterDepartment');
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    await waitFor(() => expect(mockUpdateMe).toHaveBeenCalledWith({ preferences: { prefilterDepartment: true } }));
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
    expect((await screen.findByLabelText('account.preferences.prefilterDepartment')).checked).toBe(true);
    expect(screen.getByText('account.preferences.saved').closest('[role="status"]')).toBeTruthy();
  });

  it('shows a field error instead of saving when no institution is set', async () => {
    mockGetMe.mockResolvedValue({ email: 'b@x.ca', role: 'admin', institution: '', group: '', preferences: { prefilterDepartment: false } });
    render(<AccountPage lang="en" />);
    const checkbox = await screen.findByLabelText('account.preferences.prefilterDepartment');
    expect(checkbox.disabled).toBe(false);
    expect(screen.queryByText('account.preferences.noInstitution')).toBeNull();
    fireEvent.click(checkbox);
    const error = await screen.findByRole('alert');
    expect(error.textContent).toContain('account.preferences.noInstitution');
    expect(error.id).toBe('pref-prefilter-department-error');
    expect(checkbox.getAttribute('aria-invalid')).toBe('true');
    expect(checkbox.getAttribute('aria-describedby')).toContain('pref-prefilter-department-error');
    expect(checkbox.checked).toBe(false);
    expect(mockUpdateMe).not.toHaveBeenCalled();
    // Error renders above the field, per the form pattern
    expect(error.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the Group chats table only when the user has a group, filtered by that group', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: 'Military transitions', preferences: {} });
    mockGetChatDashboard.mockResolvedValue({ data: [], recordsTotal: 0, recordsFiltered: 0 });
    render(<AccountPage lang="en" />);
    expect(await screen.findByText('Military transitions chats and reviews')).toBeTruthy();
    expect(screen.getByTestId('mock-server-table')).toBeTruthy();
    expect(screen.getByText('admin.common.columns.user')).toBeTruthy();
    expect(screen.getByText('admin.evalDashboard.columns.creatorEmail')).toBeTruthy();
    expect(screen.getByText('admin.evalDashboard.columns.expertEmail')).toBeTruthy();
    await waitFor(() => expect(mockGetChatDashboard).toHaveBeenCalled());
    const query = mockGetChatDashboard.mock.calls[0][0];
    expect(query.group).toBe('Military transitions');
    expect(query.startDate && query.endDate).toBeTruthy();
    expect(query).toEqual(expect.objectContaining({ start: 0, length: 10, orderBy: 'createdAt', orderDir: 'desc' }));
  });

  it('hides the Group chats section when the group is none', async () => {
    mockGetMe.mockResolvedValue({ email: 'b@x.ca', role: 'admin', institution: 'IRCC', group: '', preferences: {} });
    render(<AccountPage lang="en" />);
    await screen.findByLabelText('account.institution');
    expect(screen.queryByText(/chats and reviews$/)).toBeNull();
    expect(mockGetChatDashboard).not.toHaveBeenCalled();
  });

  it('saves the group pre-filter preference, and errors when no group is set', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: '', preferences: {} });
    render(<AccountPage lang="en" />);
    const checkbox = await screen.findByLabelText('account.preferences.prefilterGroup');
    fireEvent.click(checkbox);
    expect((await screen.findByRole('alert')).id).toBe('pref-prefilter-group-error');
    expect(mockUpdateMe).not.toHaveBeenCalled();
    cleanup();
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: 'Military transitions', preferences: {} });
    mockUpdateMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: 'Military transitions', preferences: { prefilterGroup: true } });
    mockRefreshUser.mockResolvedValue();
    render(<AccountPage lang="en" />);
    fireEvent.click(await screen.findByLabelText('account.preferences.prefilterGroup'));
    await waitFor(() => expect(mockUpdateMe).toHaveBeenCalledWith({ preferences: { prefilterGroup: true } }));
  });

  it('announces a load failure', async () => {
    mockGetMe.mockRejectedValue(new Error('nope'));
    render(<AccountPage lang="en" />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('account.loadError');
  });
});
