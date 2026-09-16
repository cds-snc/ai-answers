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

const mockT = (key) => key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

vi.mock('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ currentUser: { role: 'admin', _id: 'me' } }),
}));

const { mockGetAll, mockDelete } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockDelete: vi.fn(),
}));
vi.mock('../../services/UserService.js', () => ({
  default: {
    getAll: mockGetAll,
    delete: mockDelete,
    update: vi.fn(),
  },
}));

// Minimal DataTable mock that mirrors the real library's contract just
// enough to exercise UsersPage's createdRow imperative rendering (the Delete
// button, mounted via getCellRoot) — the piece that actually matters here.
vi.mock('datatables.net-react', () => {
  const MockDataTable = ({ data, options }) => {
    const ref = React.useRef(null);
    React.useEffect(() => {
      if (!ref.current || !options?.createdRow || !data || !data[0]) return;
      // `options` is a fresh object every UsersPage render, so this effect
      // re-fires on every render — clear out the previous mock row first
      // instead of accumulating duplicates.
      ref.current.innerHTML = '';
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      tr.appendChild(td);
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
    expect(screen.getByText('users.actions.deleteSuccess', { selector: '[class*="status-message--"]' })).toBeTruthy();
    expect(document.querySelector('.status-message--error-box')).toBeNull();
  });
});
