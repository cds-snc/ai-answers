/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BatchPage from '../BatchPage.js';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

const mockT = (key) => key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockDeleteBatch } = vi.hoisted(() => ({ mockDeleteBatch: vi.fn() }));
vi.mock('../../services/BatchService.js', () => ({
  default: {
    deleteBatch: mockDeleteBatch,
    retrieveBatchChats: vi.fn(),
    retrieveBatch: vi.fn(),
  },
}));
vi.mock('../../services/ExportService.js', () => ({ default: { export: vi.fn() } }));

vi.mock('../../components/batch/BatchUpload.js', () => ({ default: () => null }));
// Expose onDelete directly as a clickable button so the test can trigger the
// real BatchPage.onDelete handler without needing BatchList's own DataTable.
vi.mock('../../components/batch/BatchList.js', () => ({
  default: ({ onDelete }) => <button onClick={() => onDelete('batch-1')}>trigger-delete</button>,
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

describe('BatchPage StatusMessage roles', () => {
  afterEach(() => {
    cleanup();
    mockDeleteBatch.mockReset();
  });

  it('announces a failed delete as role="alert"', async () => {
    mockDeleteBatch.mockRejectedValue(new Error('delete failed'));

    renderWithRouter(<BatchPage lang="en" />);
    fireEvent.click(screen.getAllByText('trigger-delete')[0]);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('batch.list.actions.deleteError');
  });

  it('announces a successful delete as role="status"', async () => {
    mockDeleteBatch.mockResolvedValue({});

    renderWithRouter(<BatchPage lang="en" />);
    fireEvent.click(screen.getAllByText('trigger-delete')[0]);

    await waitFor(() => {
      expect(screen.getByText('batch.list.actions.deleteSuccess')).toBeTruthy();
    });
    expect(screen.getByText('batch.list.actions.deleteSuccess').closest('[role="status"]')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
