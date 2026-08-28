/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UsersPage from '../UsersPage.js';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

const mockT = (key) => key;
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
// enough to exercise UsersPage's createdRow imperative rendering (the Delete
// button, mounted via getCellRoot) — the piece that actually matters here.
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

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('users.actions.deleteError');
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
    expect(screen.getByText('users.actions.deleteSuccess').closest('[role="status"]')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('UsersPage institution and group columns', () => {
  afterEach(() => {
    cleanup();
    mockGetAll.mockReset();
    mockUpdate.mockReset();
  });

  it('renders institution and group selects per user, and autosaves both on change', async () => {
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
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith('u1', expect.objectContaining({ institution: 'IRCC', group: 'Military transitions', role: 'partner', active: true }));

    const groupAfter = await screen.findByLabelText('users.columns.group — a@b.com');
    fireEvent.change(groupAfter, { target: { value: '' } });
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate.mock.calls[1][1]).toEqual(expect.objectContaining({ institution: 'IRCC', group: '' }));
  });
});
