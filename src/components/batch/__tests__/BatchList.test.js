/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import BatchList from '../BatchList.js';
import BatchService from '../../../services/BatchService.js';
import { waitForAnnouncement } from '../../../../test/liveAnnouncer.js';

vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key) => {
      const map = {
        'batch.list.actions.process': 'Process',
        'batch.list.actions.delete': 'Delete',
        'batch.list.actions.cancel': 'Cancel',
        'batch.list.actions.csv': 'CSV',
        'batch.list.actions.excel': 'Excel',
        'batch.list.actions.confirmDelete': 'Are you sure?',
        'batch.list.actions.confirmDeleteNamed': 'Are you sure you want to delete "{name}"?',
        'batch.list.totalsLabel': '{finished}/{total}',
        'batch.list.deletedAnnouncement': 'Deleted: {name}.',
        'common.processing': 'Processing…',
      };
      return map[key] || key;
    },
  }),
}));

// Mutable so individual tests can flip "paused" without simulating a real
// click through PauseToggleButton (mocked below to a dumb stub) - the point
// of these tests is BatchList's own reaction to isPaused, not the toggle
// button itself. Calls fn() once on setup, same as the real hook's "fetch
// immediately, then every intervalMs" contract - without that, BatchList's
// own `batches` state never leaves its initial [], which makes every
// filteredBatches-empty test degenerate no matter what isPaused does.
let mockIsPaused = false;
const mockTogglePause = vi.fn();
vi.mock('../../../hooks/usePauseToggle.js', () => ({
  usePausablePolling: (fn) => {
    React.useEffect(() => { fn(); }, []);
    return { isPaused: mockIsPaused, togglePause: mockTogglePause };
  },
}));

vi.mock('../../admin/PauseToggleButton.js', () => ({
  default: React.forwardRef((props, ref) => <button type="button" ref={ref}>Pause</button>),
}));

vi.mock('../../../services/BatchService.js', () => ({
  default: {
    getBatchList: vi.fn(() => Promise.resolve([])),
    getBatchStatuses: vi.fn((batches) => Promise.resolve(batches)),
  },
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, onClick, disabled, buttonRole, 'data-action-key': dataActionKey }) => (
    <button type="button" onClick={onClick} disabled={disabled} data-button-role={buttonRole} data-action-key={dataActionKey}>
      {children}
    </button>
  ),
  // StatusMessage.js's info/warning/error variants render this for their icon.
  GcdsIcon: () => <span aria-hidden="true" />,
}));

vi.mock('datatables.net-dt', () => ({ default: () => null }));

let lastOptions = null;
// Increments only on a genuine remount (key change tearing down and
// recreating the component), not on an ordinary re-render with the same
// key - a mount-only effect (empty deps) is what makes that distinction,
// same as React itself.
let mountCount = 0;
vi.mock('datatables.net-react', () => {
  const MockDataTable = (props) => {
    lastOptions = props.options;
    React.useEffect(() => { mountCount += 1; }, []);
    return React.createElement('div', { 'data-testid': 'mock-data-table' });
  };
  MockDataTable.use = vi.fn();
  return { default: MockDataTable };
});

// Builds a bare 9-<td> row matching BatchList's real column count, so
// createdRow's `row.querySelectorAll('td')` / `td:last-child` /
// `previousElementSibling` lookups behave exactly as they do against a real
// DataTables-rendered row.
function makeRow() {
  const row = document.createElement('tr');
  for (let i = 0; i < 9; i++) row.appendChild(document.createElement('td'));
  document.body.appendChild(row); // real layout/focus needs the row attached
  return row;
}

const baseBatchData = (overrides = {}) => ({
  _id: 'batch-1',
  status: 'processed',
  aiProvider: 'openai-gpt51',
  workflow: 'Default',
  stats: { total: 3, processed: 3, failed: 0, finished: 3 },
  ...overrides,
});

describe('BatchList row action buttons', () => {
  beforeEach(() => {
    lastOptions = null;
    mountCount = 0;
    mockIsPaused = false;
    mockTogglePause.mockClear();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('restores focus to the row after a click-triggered remount instead of dropping it to <body>', async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true); // user confirms the delete

    render(<BatchList lang="en" processingBatches={[]} onDelete={vi.fn()} />);
    expect(lastOptions).toBeTruthy();

    // First draw: a finished/processed batch -> CSV/Excel/Delete. Delete,
    // not CSV/Excel - those are `instant` (see RowActionButtons) and no
    // longer go through the pendingFocusRef/"Processing…" flow this test
    // targets; Delete still does.
    const row = makeRow();
    await act(async () => {
      lastOptions.createdRow(row, baseBatchData());
    });

    const deleteButton = Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Delete');
    expect(deleteButton).toBeTruthy();

    // Click Delete - this arms the pending-focus ref (RowActionButtons'
    // onClick) and swaps the cell to the self-focusing "Processing…"
    // placeholder. The remount that actually loses focus in the real bug is
    // simulated by the second createdRow call below, same as a real
    // `processingBatches`/`batches` change bumping `refreshKey`.
    await act(async () => {
      deleteButton.click();
    });

    // Simulate the whole-table remount that follows in the real app: the
    // same row redraws (a fresh cell, fresh buttons - the exact moment the
    // bug lost focus to <body>, since the old cell's self-focusing
    // placeholder was torn down before the browser ever settled on it).
    const secondRow = makeRow();
    await act(async () => {
      lastOptions.createdRow(secondRow, baseBatchData());
    });

    // Specifically the Delete button that was actually clicked - not just
    // "whatever's first in the row" (CSV, in this row's own action order).
    // See pendingFocusRef's own comment: the redraw-consumption path
    // targets the exact clicked action via data-action-key, precisely so
    // this doesn't land on an unrelated control.
    const redrawnDeleteButton = Array.from(secondRow.querySelectorAll('button')).find((b) => b.textContent === 'Delete');
    expect(redrawnDeleteButton).toBeTruthy();
    expect(document.activeElement).toBe(redrawnDeleteButton);
    expect(document.activeElement).not.toBe(document.body);

    window.confirm = originalConfirm;
  });

  it('does not arm a pending focus request when Delete\'s confirm is cancelled', async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => false); // user clicks "Cancel"

    render(<BatchList lang="en" processingBatches={[]} onDelete={vi.fn()} />);
    const row = makeRow();
    await act(async () => {
      lastOptions.createdRow(row, baseBatchData());
    });

    const deleteButton = Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Delete');
    await act(async () => {
      deleteButton.click();
    });

    // Cancelled delete: no "Processing…" placeholder should have replaced
    // the buttons, and re-drawing the row shouldn't steal focus anywhere -
    // nothing was armed for this row.
    expect(row.textContent).not.toContain('Processing…');

    const secondRow = makeRow();
    await act(async () => {
      lastOptions.createdRow(secondRow, baseBatchData());
    });
    expect(document.activeElement).toBe(document.body);

    window.confirm = originalConfirm;
  });

  it('disables CSV while its own export is pending, without swapping the row to "Processing…", and re-enables after', async () => {
    let resolveExport;
    const onExport = vi.fn(() => new Promise((resolve) => { resolveExport = resolve; }));

    render(<BatchList lang="en" processingBatches={[]} onExport={onExport} />);
    const row = makeRow();
    await act(async () => {
      lastOptions.createdRow(row, baseBatchData());
    });

    const csvButton = Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'CSV');
    const excelButton = Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Excel');

    await act(async () => {
      csvButton.click();
    });

    // Still the real buttons, not the "Processing…" placeholder - exports
    // are near-instant, the placeholder swap is for Process/Delete/Cancel.
    expect(row.textContent).not.toContain('Processing…');
    expect(csvButton.disabled).toBe(true);
    // Only the clicked button is disabled - Excel is a separate export.
    expect(excelButton.disabled).toBe(false);

    // A second click while the first export is still in flight must not
    // fire onExport again (the whole point - no duplicate downloads).
    await act(async () => {
      csvButton.click();
    });
    expect(onExport).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveExport();
      await Promise.resolve();
    });
    expect(csvButton.disabled).toBe(false);
  });

  it('announces the deleted batch by name once onDelete resolves true', async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);
    const onDelete = vi.fn(() => Promise.resolve(true)); // matches BatchPage.js's onDelete contract

    const { container } = render(<BatchList lang="en" processingBatches={[]} onDelete={onDelete} />);
    const row = makeRow();
    await act(async () => {
      lastOptions.createdRow(row, baseBatchData({ name: 'Weekly digest test' }));
    });

    const deleteButton = Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Delete');
    await act(async () => {
      deleteButton.click();
      await Promise.resolve(); // let the async IIFE's onDelete await settle
    });

    expect(onDelete).toHaveBeenCalledWith('batch-1', 'Weekly digest test');
    await waitForAnnouncement('Deleted: Weekly digest test.');
    expect(container.textContent).not.toContain('Deleted: Weekly digest test.');

    window.confirm = originalConfirm;
  });

  it('redirects focus to the pause button on a successful delete, since the deleted row never redraws for pendingFocusRef to consume', async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);
    const onDelete = vi.fn(() => Promise.resolve(true));

    render(<BatchList lang="en" processingBatches={[]} onDelete={onDelete} />);
    const row = makeRow();
    await act(async () => {
      lastOptions.createdRow(row, baseBatchData());
    });

    const deleteButton = Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Delete');
    await act(async () => {
      deleteButton.click();
      // A real macrotask, not just a microtask: the pause-button focus is
      // deferred via setTimeout specifically so it runs after the
      // "Processing…" placeholder's own self-focus (scheduled through its
      // own separate React root's commit) has already happened - see
      // handleDelete's own comment on why a microtask tick isn't enough.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Unlike the click-triggered-remount test above, this deliberately does
    // NOT call createdRow again for this batchId - a real successful delete
    // never redraws the row (it's gone from the next fetch), so
    // RowActionButtons' own pendingFocusRef-consuming effect structurally
    // cannot fire. Focus should land on the pause button instead of being
    // lost to <body>.
    const pauseButton = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Pause');
    expect(pauseButton).toBeTruthy();
    expect(document.activeElement).toBe(pauseButton);
    expect(document.activeElement).not.toBe(document.body);

    window.confirm = originalConfirm;
  });

  it('restores focus to Delete specifically (not the row\'s first button) when a delete fails and the row redraws', async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);
    const onDelete = vi.fn(() => Promise.resolve(false)); // delete failed

    render(<BatchList lang="en" processingBatches={[]} onDelete={onDelete} />);
    // A finished/processed batch's row order is CSV, Excel, Delete - CSV is
    // the row's first interactive element, which is exactly the wrong
    // button the old "grab whatever's first" fallback would land on.
    const row = makeRow();
    await act(async () => {
      lastOptions.createdRow(row, baseBatchData());
    });

    const deleteButton = Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Delete');
    await act(async () => {
      deleteButton.click();
    });

    // A failed delete doesn't remove the batch - it redraws with the same
    // actions, same as any other unfinished action. This is the real
    // "redraw-consumption" path (not the pause-button fallback, which only
    // fires on success), so pendingFocusRef must still be armed here.
    const secondRow = makeRow();
    await act(async () => {
      lastOptions.createdRow(secondRow, baseBatchData());
    });

    const redrawnDeleteButton = Array.from(secondRow.querySelectorAll('button')).find((b) => b.textContent === 'Delete');
    const redrawnCsvButton = Array.from(secondRow.querySelectorAll('button')).find((b) => b.textContent === 'CSV');
    expect(redrawnDeleteButton).toBeTruthy();
    expect(document.activeElement).toBe(redrawnDeleteButton);
    expect(document.activeElement).not.toBe(redrawnCsvButton);
    expect(document.activeElement).not.toBe(document.body);

    window.confirm = originalConfirm;
  });

  it('resumes auto-updates when Process is clicked while paused', async () => {
    mockIsPaused = true;
    mockTogglePause.mockClear();
    render(<BatchList lang="en" processingBatches={[]} onProcess={vi.fn()} />);
    const row = makeRow();
    await act(async () => {
      lastOptions.createdRow(row, baseBatchData({ status: 'uploaded', stats: { total: 5, processed: 0, failed: 0, finished: 0 } }));
    });

    const processButton = Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Process');
    const fetchCountBeforeClick = BatchService.getBatchList.mock.calls.length;
    await act(async () => {
      processButton.click();
    });

    // Starting a process is a stronger signal than "leave this be" (what
    // pause means) - clicking it resumes auto-updates rather than leaving
    // this row's own progress frozen right next to the button that started it.
    expect(mockTogglePause).toHaveBeenCalledTimes(1);
    // Resuming shouldn't just un-skip the *next* scheduled poll tick (up to
    // 10s away, on usePausablePolling's own clock) - it should refetch right
    // away, same as delete already does, so the table doesn't sit looking
    // frozen after a click that was supposed to make it live again.
    expect(BatchService.getBatchList.mock.calls.length).toBeGreaterThan(fetchCountBeforeClick);
  });

  it('paints the currently-sorted column\'s cell with DataTables\' own sorting_1 class, manually - not relying on DataTables\' internal (unreliable for this client-side table) classing', async () => {
    render(<BatchList lang="en" processingBatches={[]} onDelete={vi.fn()} />);
    const row = makeRow();
    await act(async () => {
      lastOptions.createdRow(row, baseBatchData());
    });

    const cells = row.querySelectorAll('td');
    // Default order is [[2, 'desc']] (Created Date) - see sortOrderRef.
    expect(cells[2].classList.contains('sorting_1')).toBe(true);
    // No other cell should carry a stale sorting_1/2/3 from a previous draw.
    cells.forEach((cell, i) => {
      if (i !== 2) {
        expect(cell.classList.contains('sorting_1')).toBe(false);
        expect(cell.classList.contains('sorting_2')).toBe(false);
        expect(cell.classList.contains('sorting_3')).toBe(false);
      }
    });
  });

  it('shows Process + Delete (no export buttons) for a batch that is not yet finished', async () => {
    render(<BatchList lang="en" processingBatches={[]} onDelete={vi.fn()} />);
    const row = makeRow();
    await act(async () => {
      lastOptions.createdRow(row, baseBatchData({ status: 'processing', stats: { total: 5, processed: 2, failed: 0, finished: 2 } }));
    });

    const labels = Array.from(row.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toContain('Process');
    expect(labels).toContain('Delete');
    expect(labels).not.toContain('CSV');
    expect(labels).not.toContain('Excel');
  });

  it('does not remount while paused, even when processingBatches changes (the "lists cancel each other out" bug: processingBatches is shared across both BatchList instances on BatchPage.js)', async () => {
    // A non-empty filtered list - otherwise "empty stays empty" alone would
    // already explain a skipped remount, independent of the pause fix this
    // test targets. batchStatus has to actually match, or filteredBatches
    // is empty regardless of what getBatchList returns (an empty desired[]
    // list matches nothing).
    BatchService.getBatchList.mockResolvedValueOnce([baseBatchData({ status: 'uploaded' })]);

    mockIsPaused = true;
    const { rerender } = render(
      <BatchList lang="en" batchStatus="uploaded,in_progress" processingBatches={[]} onDelete={vi.fn()} />
    );
    await act(async () => {}); // flush the mount-time fetch
    expect(mountCount).toBe(1);

    // Simulate an action in the *other* BatchList instance changing the
    // shared processingBatches array - same prop, new reference, this list
    // untouched by the user.
    await act(async () => {
      rerender(<BatchList lang="en" batchStatus="uploaded,in_progress" processingBatches={['some-other-batch']} onDelete={vi.fn()} />);
    });
    expect(mountCount).toBe(1); // still frozen - no remount while paused

    // Resuming should immediately catch up rather than waiting for the next
    // poll tick.
    mockIsPaused = false;
    await act(async () => {
      rerender(<BatchList lang="en" batchStatus="uploaded,in_progress" processingBatches={['some-other-batch']} onDelete={vi.fn()} />);
    });
    expect(mountCount).toBe(2);
  });
});
