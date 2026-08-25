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
// batchStatus distinguishes the "running" instance from the "processed" one
// (BatchPage.js passes a different batchStatus filter to each) - labeled
// per-section so tests can trigger a failure in one specific section
// without also triggering the other.
vi.mock('../../components/batch/BatchList.js', () => ({
  default: ({ onDelete, batchStatus }) => {
    const section = batchStatus === 'processed' ? 'processed' : 'running';
    return <button onClick={() => onDelete('batch-1')}>trigger-delete-{section}</button>;
  },
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
    fireEvent.click(screen.getByText('trigger-delete-running'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('batch.list.actions.deleteError');
  });

  it('announces a successful delete as an sr-only role="status" region, not a visible box', async () => {
    mockDeleteBatch.mockResolvedValue({});

    renderWithRouter(<BatchPage lang="en" />);
    fireEvent.click(screen.getByText('trigger-delete-running'));

    await waitFor(() => {
      expect(screen.getByText('batch.list.actions.deleteSuccess')).toBeTruthy();
    });
    const region = screen.getByText('batch.list.actions.deleteSuccess').closest('[role="status"]');
    expect(region).toBeTruthy();
    // Success is sr-only, not a visible box - the table itself already shows
    // the outcome to a sighted user (the row disappears), so this shouldn't
    // render as a status-message--success-box the way an error does.
    expect(region.className).toContain('sr-only');
    expect(region.className).not.toContain('status-message--success-box');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("does not remount/re-announce the processed section's error box when a later, unrelated error fires in the running section", async () => {
    mockDeleteBatch.mockRejectedValue(new Error('delete failed'));

    renderWithRouter(<BatchPage lang="en" />);

    // Establish a real, non-null error in "processed" first - the shared-
    // nonce bug only manifests once a section already has content to
    // preserve (an untouched section renders null regardless of nonce, see
    // StatusMessage.js's own early-return branch).
    fireEvent.click(screen.getByText('trigger-delete-processed'));
    const processedAlert = await screen.findAllByRole('alert');
    // Both sections' boxes share role="alert" text/classing, so identify
    // "processed"'s specifically by DOM position relative to its own
    // trigger button, then capture its node identity to compare later.
    const processedNode = screen.getByText('trigger-delete-processed').closest('section').querySelector('[role="alert"]');
    expect(processedNode).toBeTruthy();

    // Now fire a second, unrelated error in "running" only.
    fireEvent.click(screen.getByText('trigger-delete-running'));
    await waitFor(() => {
      const runningNode = screen.getByText('trigger-delete-running').closest('section').querySelector('[role="alert"]');
      expect(runningNode).toBeTruthy();
    });

    // "processed"'s own error box must be the exact same DOM node as
    // before - a shared nonce would have forced it to remount (a fresh
    // node, its stale text freshly inserted) purely because "running"
    // changed, even though errors.processed itself never did.
    const processedNodeAfter = screen.getByText('trigger-delete-processed').closest('section').querySelector('[role="alert"]');
    expect(processedNodeAfter).toBe(processedNode);
  });

  it('clears a section\'s visible error box once a later action in that same section succeeds', async () => {
    mockDeleteBatch.mockRejectedValueOnce(new Error('delete failed'));

    renderWithRouter(<BatchPage lang="en" />);
    fireEvent.click(screen.getByText('trigger-delete-running'));
    await screen.findByRole('alert');

    // Retry, this time succeeding - the earlier error box shouldn't just
    // sit there forever contradicting what actually happened.
    mockDeleteBatch.mockResolvedValueOnce({});
    fireEvent.click(screen.getByText('trigger-delete-running'));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
