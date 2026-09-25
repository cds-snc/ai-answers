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
    mockGetMe.mockResolvedValue({ email: 'b@x.ca', role: 'admin', institution: 'DND-MDN', group: '' });
    render(<AccountPage lang="en" />);
    const institution = await screen.findByLabelText('account.institution');
    expect(institution.options[0].textContent).toBe('users.institutionNone');
    expect(screen.getByLabelText('account.group').value).toBe('');
    expect(screen.getByLabelText('account.group').options[0].textContent).toBe('users.groupNone');

    fireEvent.change(institution, { target: { value: '' } });
    expect(institution.value).toBe('');
    expect(screen.getByText('users.pickInstitutionFirst')).toBeTruthy();
    expect(screen.queryByText('users.noGroupsForInstitution')).toBeNull();
  });

  it('stages a self-picked institution until Save, then saves it, refreshes the auth user and moves focus to the outcome', async () => {
    mockGetMe.mockResolvedValue({ email: 'b@x.ca', role: 'partner', institution: '', group: '', preferences: { prefilterDepartment: false } });
    mockUpdateMe.mockResolvedValue({ email: 'b@x.ca', role: 'partner', institution: 'IRCC', group: '', preferences: { prefilterDepartment: false } });
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
    mockGetMe.mockResolvedValue({ email: 'b@x.ca', role: 'admin', institution: 'IRCC', group: '', preferences: {} });
    mockUpdateMe.mockResolvedValue({ email: 'b@x.ca', role: 'admin', institution: 'DND-MDN', group: 'Military transitions', preferences: {} });
    mockRefreshUser.mockResolvedValue();
    render(<AccountPage lang="en" />);
    fireEvent.change(await screen.findByLabelText('account.institution'), { target: { value: 'DND-MDN' } });
    fireEvent.change(screen.getByLabelText('account.group'), { target: { value: 'Military transitions' } });
    fireEvent.click(screen.getByRole('button', { name: 'users.actions.save' }));
    await waitFor(() => expect(mockUpdateMe).toHaveBeenCalledTimes(1));
    expect(mockUpdateMe).toHaveBeenCalledWith({ institution: 'DND-MDN', group: 'Military transitions' });
  });

  it('renders a locked institution/group read-only with no hint, no notice and no Save button, for a partner', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: 'Military transitions', preferences: {} });
    render(<AccountPage lang="en" />);
    expect(await screen.findByText('DND-MDN')).toBeTruthy();
    expect(screen.getByText('Military transitions')).toBeTruthy();
    expect(screen.queryByText('account.institutionLocked')).toBeNull();
    expect(screen.queryByText('account.groupLocked')).toBeNull();
    expect(screen.queryByText('account.lockNotice')).toBeNull();
    expect(screen.queryByLabelText('account.institution')).toBeNull();
    expect(screen.queryByLabelText('account.group')).toBeNull();
    expect(screen.queryByRole('button', { name: 'users.actions.save' })).toBeNull();
  });

  it('keeps an unset field editable for a partner while the set one is locked', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: '', preferences: {} });
    render(<AccountPage lang="en" />);
    expect(await screen.findByText('DND-MDN')).toBeTruthy();
    expect(screen.queryByText('account.institutionLocked')).toBeNull();
    expect(screen.getByLabelText('account.group').tagName).toBe('SELECT');
    expect(screen.getByRole('button', { name: 'users.actions.save' })).toBeTruthy();
  });

  it('only lists the groups that belong to the chosen institution, or says there are none', async () => {
    mockGetMe.mockResolvedValue({ email: 'b@x.ca', role: 'admin', institution: 'IRCC', group: '', preferences: {} });
    render(<AccountPage lang="en" />);
    const groupValues = () => [...screen.getByLabelText('account.group').options].map((o) => o.value);
    expect(await screen.findByText('users.noGroupsForInstitution')).toBeTruthy();
    expect(screen.queryByLabelText('account.group')).toBeNull();

    fireEvent.change(screen.getByLabelText('account.institution'), { target: { value: 'DND-MDN' } });
    expect(groupValues()).toEqual(['', 'Military transitions']);
    expect(screen.queryByText('users.noGroupsForInstitution')).toBeNull();

    fireEvent.change(screen.getByLabelText('account.institution'), { target: { value: 'CEO-BEC' } });
    expect(groupValues()).toEqual(['', 'AI Answers QA']);
  });

  it('clears a picked group when the institution changes to one it doesn\'t belong to', async () => {
    mockGetMe.mockResolvedValue({ email: 'b@x.ca', role: 'admin', institution: 'DND-MDN', group: 'Military transitions', preferences: {} });
    render(<AccountPage lang="en" />);
    fireEvent.change(await screen.findByLabelText('account.institution'), { target: { value: 'IRCC' } });
    expect(screen.queryByLabelText('account.group')).toBeNull();
    expect(screen.getByText('users.noGroupsForInstitution')).toBeTruthy();
  });

  it('leaves the admin-only QA group out of a CEO-BEC partner\'s group choices', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@x.ca', role: 'partner', institution: 'CEO-BEC', group: '', preferences: {} });
    render(<AccountPage lang="en" />);
    expect(await screen.findByText('users.noGroupsForInstitution')).toBeTruthy();
    expect(screen.queryByLabelText('account.group')).toBeNull();
  });

  it('shows the lock notice above Save only once a partner stages a change, and hides it when the change is undone', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: '', preferences: {} });
    render(<AccountPage lang="en" />);
    const select = await screen.findByLabelText('account.group');
    expect(screen.queryByText('account.lockNotice')).toBeNull();

    fireEvent.change(select, { target: { value: 'Military transitions' } });
    const notice = screen.getByText('account.lockNotice');
    const save = screen.getByRole('button', { name: 'users.actions.save' });
    expect(notice.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.change(select, { target: { value: '' } });
    expect(screen.queryByText('account.lockNotice')).toBeNull();
  });

  it('never shows the lock notice to an admin, whose picks do not lock', async () => {
    mockGetMe.mockResolvedValue({ email: 'b@x.ca', role: 'admin', institution: '', group: '', preferences: {} });
    render(<AccountPage lang="en" />);
    const select = await screen.findByLabelText('account.institution');
    fireEvent.change(select, { target: { value: 'IRCC' } });
    expect(screen.getByRole('button', { name: 'users.actions.save' }).disabled).toBe(false);
    expect(screen.queryByText('account.lockNotice')).toBeNull();
  });

  it('shows the French group label in the French UI', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'admin', institution: '', group: 'Military transitions', preferences: {} });
    render(<AccountPage lang="fr" />);
    const group = await screen.findByLabelText('account.group');
    expect(group.value).toBe('Military transitions');
    expect(group.selectedOptions[0].textContent).toBe('Transitions militaires');
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
    expect(screen.getByText('account.preferences.savedChange').closest('.status-message--success-box')).toBeTruthy();
  });

  it('ignores a second checkbox click while a preference save is in flight', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: '', preferences: { prefilterDepartment: false } });
    let releaseSave;
    mockUpdateMe.mockReturnValue(new Promise((resolve) => { releaseSave = resolve; }));
    mockRefreshUser.mockResolvedValue();
    render(<AccountPage lang="en" />);
    const checkbox = await screen.findByLabelText('account.preferences.prefilterDepartment');
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);
    await waitFor(() => expect(mockUpdateMe).toHaveBeenCalledTimes(1));
    releaseSave({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: '', preferences: { prefilterDepartment: true } });
    await waitFor(() => expect(screen.getByLabelText('account.preferences.prefilterDepartment').checked).toBe(true));
    expect(mockUpdateMe).toHaveBeenCalledTimes(1);
    expect(mockUpdateMe).toHaveBeenCalledWith({ preferences: { prefilterDepartment: true } });
  });

  it('clears a stale success message when a later preference toggle is blocked by validation', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: '', preferences: { prefilterDepartment: false, prefilterGroup: false } });
    mockUpdateMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: '', preferences: { prefilterDepartment: true, prefilterGroup: false } });
    mockRefreshUser.mockResolvedValue();
    render(<AccountPage lang="en" />);
    fireEvent.click(await screen.findByLabelText('account.preferences.prefilterDepartment'));
    await waitFor(() => expect(screen.getByText('account.preferences.savedChange').closest('.status-message--success-box')).toBeTruthy());

    // Group isn't set, so this click is blocked by validation rather than
    // saved - the prior success message must not linger next to the new error.
    fireEvent.click(screen.getByLabelText('account.preferences.prefilterGroup'));
    await screen.findByText('account.preferences.noGroup');
    expect(screen.queryByText('account.preferences.savedChange')).toBeNull();
  });

  it('shows a field error instead of saving when no institution is set', async () => {
    mockGetMe.mockResolvedValue({ email: 'b@x.ca', role: 'admin', institution: '', group: '', preferences: { prefilterDepartment: false } });
    render(<AccountPage lang="en" />);
    const checkbox = await screen.findByLabelText('account.preferences.prefilterDepartment');
    expect(checkbox.disabled).toBe(false);
    expect(screen.queryByText('account.preferences.noInstitution')).toBeNull();
    fireEvent.click(checkbox);
    // FeedbackInlineError skips role="alert" when it has an inputRef to focus
    // (see the component's comment) - focus is what reads it out instead.
    const error = await screen.findByText('account.preferences.noInstitution');
    expect(error.id).toBe('pref-prefilter-department-error');
    await waitFor(() => expect(document.activeElement).toBe(error));
    expect(checkbox.getAttribute('aria-invalid')).toBe('true');
    expect(checkbox.getAttribute('aria-describedby')).toContain('pref-prefilter-department-error');
    expect(checkbox.checked).toBe(false);
    expect(mockUpdateMe).not.toHaveBeenCalled();
    // Error renders above the field, per the form pattern
    expect(error.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the right persistent pre-filter explainer for institution-only, group-only, both, or neither', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: '', preferences: { prefilterDepartment: true, prefilterGroup: false } });
    render(<AccountPage lang="en" />);
    expect(await screen.findByText('account.preferences.filteredInstitution')).toBeTruthy();
    // Public dashboard's "not affected" paragraph and the footer are shared
    // by every variant of the notice.
    expect(screen.getByText('account.preferences.filteredPublicLabel account.preferences.filteredPublicEffect')).toBeTruthy();
    expect(screen.getByText('account.preferences.filteredFooter')).toBeTruthy();
    expect(screen.queryByText('account.preferences.filteredGroup')).toBeNull();
    cleanup();

    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: '', group: 'Military transitions', preferences: { prefilterDepartment: false, prefilterGroup: true } });
    render(<AccountPage lang="en" />);
    expect(await screen.findByText('account.preferences.filteredGroup')).toBeTruthy();
    expect(screen.getByText('account.preferences.filteredPublicLabel account.preferences.filteredPublicEffect')).toBeTruthy();
    expect(screen.getByText('account.preferences.filteredFooter')).toBeTruthy();
    cleanup();

    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: 'Military transitions', preferences: { prefilterDepartment: true, prefilterGroup: true } });
    render(<AccountPage lang="en" />);
    // Label and effect render as siblings in the same paragraph (the label's
    // bolded dashboard name(s) only show up when the real locale string's
    // *asterisk* markers are present - the t() mock just echoes the key, so
    // there's no <strong> to isolate here; assert the combined text instead.
    expect(await screen.findByText('account.preferences.filteredBothChatEvalLabel account.preferences.filteredBothChatEvalEffect')).toBeTruthy();
    expect(screen.getByText('account.preferences.filteredBothMetricsPartnerLabel account.preferences.filteredBothMetricsPartnerEffect')).toBeTruthy();
    expect(screen.getByText('account.preferences.filteredPublicLabel account.preferences.filteredPublicEffect')).toBeTruthy();
    // Footer is its own paragraph, shared by every variant of the notice.
    expect(screen.getByText('account.preferences.filteredFooter')).toBeTruthy();
    expect(screen.queryByText('account.preferences.filteredInstitution')).toBeNull();
    cleanup();

    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: '', group: '', preferences: { prefilterDepartment: false, prefilterGroup: false } });
    render(<AccountPage lang="en" />);
    await screen.findByText('account.institution');
    expect(screen.queryByText('account.preferences.filteredInstitution')).toBeNull();
    expect(screen.queryByText('account.preferences.filteredGroup')).toBeNull();
    expect(screen.queryByText('account.preferences.filteredFooter')).toBeNull();
  });

  it('saves the group pre-filter preference, and errors when no group is set', async () => {
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: '', preferences: {} });
    render(<AccountPage lang="en" />);
    const checkbox = await screen.findByLabelText('account.preferences.prefilterGroup');
    fireEvent.click(checkbox);
    expect((await screen.findByText('account.preferences.noGroup')).id).toBe('pref-prefilter-group-error');
    expect(mockUpdateMe).not.toHaveBeenCalled();
    cleanup();
    mockGetMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: 'Military transitions', preferences: {} });
    mockUpdateMe.mockResolvedValue({ email: 'a@dnd.ca', role: 'partner', institution: 'DND-MDN', group: 'Military transitions', preferences: { prefilterGroup: true } });
    mockRefreshUser.mockResolvedValue();
    render(<AccountPage lang="en" />);
    fireEvent.click(await screen.findByLabelText('account.preferences.prefilterGroup'));
    await waitFor(() => expect(mockUpdateMe).toHaveBeenCalledWith({ preferences: { prefilterGroup: true } }));
  });

  it('moves focus to the load error and hides profile/activity content', async () => {
    mockGetMe.mockRejectedValue(new Error('nope'));
    render(<AccountPage lang="en" />);
    const message = await screen.findByText('account.loadError');
    await waitFor(() => expect(document.activeElement).toBe(message));
    expect(message.getAttribute('data-announced-via')).toBe('focus');
    // Nothing that depends on the profile (preferences, activity/assigned
    // chats) should render when it failed to load.
    expect(screen.queryByText('account.preferences.heading')).toBeNull();
    // account.assignedChats.heading is now sr-only (ServerDataTable's
    // `caption` prop, mocked away in this test's DataTable mock) rather
    // than a visible heading - activityHeading is the meaningful check
    // that the whole assigned-chats section didn't render.
    expect(screen.queryByText('account.activityHeading')).toBeNull();
  });
});
