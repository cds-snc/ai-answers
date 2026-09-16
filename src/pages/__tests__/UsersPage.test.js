/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UsersPage from '../UsersPage.js';
import { waitForAnnouncement } from '../../../test/liveAnnouncer.js';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

// vi.fn() (not a plain arrow function) so one test can override its
// implementation to check {email} substitution, while every other test gets
// the plain key-passthrough default.
const mockT = vi.fn((key) => key);
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

vi.mock('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ currentUser: { role: 'admin', _id: 'me' } }),
}));

const { mockGetAll, mockDelete, mockUpdate } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockDelete: vi.fn(),
  mockUpdate: vi.fn(),
}));
vi.mock('../../services/UserService.js', () => ({
  default: {
    getAll: mockGetAll,
    delete: mockDelete,
    update: mockUpdate,
  },
}));

// Minimal DataTable mock that mirrors the real library's contract just
// enough to exercise UsersPage's createdRow imperative rendering (the
// Save/Delete buttons mounted via getCellRoot, and the inline <select>
// change handlers createdRow attaches) — the piece that actually matters
// here.
vi.mock('datatables.net-react', () => {
  const MockDataTable = ({ data, options, columns }) => {
    const ref = React.useRef(null);
    React.useEffect(() => {
      if (!ref.current || !options?.createdRow || !data || !data[0]) return;
      // `options` is a fresh object every UsersPage render, so this effect
      // re-fires on every render — clear out the previous mock row first
      // instead of accumulating duplicates.
      ref.current.innerHTML = '';
      const tr = document.createElement('tr');
      // Render every column's display cell the way DataTables would, so
      // the inline select/input change handlers attached in createdRow
      // can be exercised; the actions cell stays last.
      (columns || []).forEach((col) => {
        const td = document.createElement('td');
        if (col.data && typeof col.render === 'function') {
          td.innerHTML = col.render(data[0][col.data], 'display', data[0]);
        }
        tr.appendChild(td);
      });
      ref.current.appendChild(tr);
      options.createdRow(tr, data[0]);
    });
    return <div ref={ref} data-testid="mock-datatable" />;
  };
  MockDataTable.use = vi.fn();
  return { default: MockDataTable };
});
vi.mock('datatables.net-dt', () => ({ default: () => null }));
vi.mock('datatables.net-dt/css/dataTables.dataTables.css', () => ({}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <p>{children}</p>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

describe('UsersPage StatusMessage roles', () => {
  afterEach(() => {
    cleanup();
    mockGetAll.mockReset();
    mockDelete.mockReset();
    mockUpdate.mockReset();
    vi.restoreAllMocks();
  });

  it('announces a failed delete as role="alert"', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockGetAll.mockResolvedValue([{ _id: 'u1', email: 'a@b.com', role: 'admin', active: true }]);
    mockDelete.mockRejectedValue(new Error('delete failed'));

    renderWithRouter(<UsersPage lang="en" />);

    const deleteButton = await screen.findByText('users.actions.delete');
    fireEvent.click(deleteButton);

    await waitForAnnouncement('users.actions.deleteError', 'assertive');
  });

  it('re-announces two identical consecutive failed deletes, not just the first', async () => {
    // Regression test for useRepeatableStatus's nonce: without it, a second
    // outcome with identical text goes silent because the rendered text
    // never actually changes (a failed delete leaves the row untouched, so
    // clicking it twice in a row produces the exact same error text twice).
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockGetAll.mockResolvedValue([{ _id: 'u1', email: 'a@b.com', role: 'admin', active: true }]);
    mockDelete.mockRejectedValue(new Error('delete failed'));

    renderWithRouter(<UsersPage lang="en" />);

    const deleteButton = await screen.findByText('users.actions.delete');
    fireEvent.click(deleteButton);
    await waitForAnnouncement('users.actions.deleteError', 'assertive');

    fireEvent.click(deleteButton);
    await waitFor(() => {
      const occurrences = document.querySelectorAll('[data-live-announcer="assertive"] > *');
      const matches = Array.from(occurrences).filter((el) => el.textContent === 'users.actions.deleteError');
      expect(matches.length).toBe(2);
    });
  });

  it('announces a successful delete as role="status"', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockGetAll.mockResolvedValue([{ _id: 'u1', email: 'a@b.com', role: 'admin', active: true }]);
    mockDelete.mockResolvedValue({});

    renderWithRouter(<UsersPage lang="en" />);

    const deleteButton = await screen.findByText('users.actions.delete');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText('users.actions.deleteSuccess')).toBeTruthy();
    });
    const successBox = screen.getByText('users.actions.deleteSuccess', { selector: '[class*="status-message--"]' });
    expect(successBox).toBeTruthy();
    expect(document.querySelector('.status-message--error-box')).toBeNull();
    // The deleted row (and the Delete button just clicked) is gone from the
    // DOM — focus must land here explicitly, not silently drop to <body>.
    expect(document.activeElement).toBe(successBox);
  });
});

// Regression coverage for the 3.2.2 fix: a native <select> fires `change` on
// every arrow-key press while browsing options (not just on a committed
// choice), so autosaving straight from onchange could commit an unintended,
// privilege-escalating role change before the user lands on the one they
// meant to pick. Selecting a value must only stage it; nothing reaches the
// server until Save is clicked.
describe('UsersPage select changes stage instead of autosaving', () => {
  afterEach(() => {
    cleanup();
    mockGetAll.mockReset();
    mockUpdate.mockReset();
    mockT.mockImplementation((key) => key);
  });

  it('does not call UserService.update when the role select changes, only when Save is clicked', async () => {
    mockGetAll.mockResolvedValue([{ _id: 'u1', email: 'a@b.com', role: 'partner', active: true }]);
    mockUpdate.mockImplementation(async (userId, updates) => ({ _id: userId, email: 'a@b.com', ...updates }));

    renderWithRouter(<UsersPage lang="en" />);

    const roleSelect = await screen.findByLabelText('users.columns.role — a@b.com');
    const saveButton = await screen.findByText('users.actions.save');
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(roleSelect, { target: { value: 'admin' } });

    // Give any accidental autosave a chance to fire before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockUpdate).not.toHaveBeenCalled();
    // renderActionsCell rebuilds this cell's DOM node (getCellRoot), so the
    // enabled button after staging is a new element — re-query for it.
    const enabledSaveButton = screen.getByText('users.actions.save');
    expect(enabledSaveButton.disabled).toBe(false);

    fireEvent.click(enabledSaveButton);
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith('u1', expect.objectContaining({ role: 'admin', active: true }));

    // The redraw that disables Save (now that changed=false) drops focus off
    // the button just clicked — it must land on the outcome message instead
    // of silently falling to <body>.
    await waitFor(() => {
      const successBox = screen.getByText('users.actions.saveSuccessRole', { selector: '[class*="status-message--"]' });
      expect(document.activeElement).toBe(successBox);
    });
  });

  // Regression test: an earlier version of this message used a `users.find()`
  // lookup that could silently miss, falling back to the raw Mongo id
  // instead of the email — with the identity-passthrough mockT elsewhere in
  // this file, that failure mode is invisible (the id and the fallback
  // literal look the same). Real templates here catch it for real.
  it('names the actual user and changed field, not a placeholder or a raw id', async () => {
    mockGetAll.mockResolvedValue([{ _id: 'u1', email: 'jane@example.com', role: 'partner', active: true }]);
    mockUpdate.mockImplementation(async (userId, updates) => ({ _id: userId, email: 'jane@example.com', ...updates }));
    mockT.mockImplementation((key) => ({
      'users.actions.saveSuccessRole': "{email}'s role updated to {role}.",
      'users.roles.admin': 'Admin',
      'users.roles.partner': 'Partner',
    }[key] ?? key));

    renderWithRouter(<UsersPage lang="en" />);

    const roleSelect = await screen.findByLabelText('users.columns.role — jane@example.com');
    fireEvent.change(roleSelect, { target: { value: 'admin' } });
    fireEvent.click(screen.getByText('users.actions.save'));

    await waitFor(() => {
      expect(screen.getByText("jane@example.com's role updated to Admin.")).toBeTruthy();
    });
    expect(screen.queryByText(/\{email\}|\{role\}/)).toBeNull();
    expect(screen.queryByText('u1', { exact: false })).toBeNull();
  });

  // Regression: revert to the original value should disable Save again.
  it('disables Save again when the select is changed back to its original value', async () => {
    mockGetAll.mockResolvedValue([{ _id: 'u1', email: 'a@b.com', role: 'partner', active: true }]);

    renderWithRouter(<UsersPage lang="en" />);

    const roleSelect = await screen.findByLabelText('users.columns.role — a@b.com');
    expect((await screen.findByText('users.actions.save')).disabled).toBe(true);

    fireEvent.change(roleSelect, { target: { value: 'admin' } });
    expect(screen.getByText('users.actions.save').disabled).toBe(false);

    fireEvent.change(roleSelect, { target: { value: 'partner' } });
    expect(screen.getByText('users.actions.save').disabled).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('UsersPage institution and group columns', () => {
  afterEach(() => {
    cleanup();
    mockGetAll.mockReset();
    mockUpdate.mockReset();
  });

  it('renders institution and group selects per user, and stages both changes until Save', async () => {
    mockGetAll.mockResolvedValue([{ _id: 'u1', email: 'a@b.com', role: 'partner', active: true, institution: 'DND-MDN', group: 'Military transitions' }]);
    mockUpdate.mockImplementation(async (userId, updates) => ({ _id: userId, email: 'a@b.com', role: 'partner', active: true, ...updates }));

    renderWithRouter(<UsersPage lang="en" />);

    const institutionSelect = await screen.findByLabelText('users.columns.institution — a@b.com');
    expect(institutionSelect.tagName).toBe('SELECT');
    expect(institutionSelect.value).toBe('DND-MDN');
    // Unassigned option first, then the shared partner list
    expect(institutionSelect.options[0].value).toBe('');
    expect(institutionSelect.options[0].textContent).toBe('users.institutionNone');
    expect(Array.from(institutionSelect.options).some(o => o.value === 'IRCC')).toBe(true);

    const groupSelect = screen.getByLabelText('users.columns.group — a@b.com');
    expect(groupSelect.tagName).toBe('SELECT');
    expect(groupSelect.value).toBe('Military transitions');
    expect(groupSelect.options[0].value).toBe('');
    expect(groupSelect.options[0].textContent).toBe('users.groupNone');

    fireEvent.change(institutionSelect, { target: { value: 'IRCC' } });
    expect(mockUpdate).not.toHaveBeenCalled();
    // renderActionsCell rebuilds this cell's DOM node (getCellRoot), so the
    // enabled button after staging is a new element — re-query for it.
    fireEvent.click(screen.getByText('users.actions.save'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith('u1', expect.objectContaining({ institution: 'IRCC', group: 'Military transitions', role: 'partner', active: true }));

    const groupAfter = await screen.findByLabelText('users.columns.group — a@b.com');
    fireEvent.change(groupAfter, { target: { value: '' } });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('users.actions.save'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate.mock.calls[1][1]).toEqual(expect.objectContaining({ institution: 'IRCC', group: '' }));
  });
});
