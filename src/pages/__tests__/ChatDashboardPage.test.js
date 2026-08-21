/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import ChatDashboardPage from '../ChatDashboardPage.js';
import DashboardService from '../../services/DashboardService.js';

// Mock dependencies
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key, defaultValue) => defaultValue || key
  })
}));

vi.mock('../../services/DashboardService.js', () => ({
  default: {
    getChatDashboard: vi.fn(() => Promise.resolve({
      recordsTotal: 0,
      recordsFiltered: 0,
      data: []
    }))
  }
}));

// A closer-to-real DataTables mock than a plain `() => null`: captures the
// `options` given to the most recently rendered instance (so a test can call
// its `ajax` directly, the way the real DataTables library would in response
// to a search/page/sort), and - once per actual mount, guarded by refs since
// ChatDashboardPage re-renders the same instance many times without
// remounting - invokes `initComplete` the way real DataTables does, bound to
// a fake settings object exposing `.api()`. Each mounted instance gets its
// own `ajaxReload` spy pushed to `mountedInstances`, so a test can assert
// that a *specific* (e.g. outgoing, pre-Clear) instance's ajax.reload was or
// wasn't called - the whole point of the regression test below.
let lastOptions = null;
let mountedInstances = [];
vi.mock('datatables.net-react', () => {
  const MockDataTable = (props) => {
    lastOptions = props.options;
    const apiRef = React.useRef(null);
    const firedRef = React.useRef(false);
    if (!apiRef.current) {
      apiRef.current = {
        ajaxReload: vi.fn(),
        headerCells: [{ setAttribute: vi.fn() }, { setAttribute: vi.fn() }]
      };
      mountedInstances.push(apiRef.current);
    }
    if (!firedRef.current) {
      firedRef.current = true;
      const headerCells = apiRef.current.headerCells;
      const settings = {
        api: () => ({
          ajax: { reload: apiRef.current.ajaxReload },
          columns: () => ({ header: () => ({ each: (fn) => headerCells.forEach(fn) }) }),
          table: () => ({ container: () => ({ querySelector: () => null }) }),
          search: () => '',
          on: () => {}
        })
      };
      props.options?.initComplete?.call(settings);
    }
    return React.createElement('div', { 'data-testid': 'mock-data-table' });
  };
  MockDataTable.use = vi.fn();
  return {
    default: MockDataTable
  };
});

vi.mock('datatables.net-dt', () => ({
  default: () => null
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsIcon: () => <span aria-hidden="true" />
}));

describe('ChatDashboardPage rendering', () => {
  afterEach(() => {
    cleanup();
    lastOptions = null;
    mountedInstances = [];
  });

  it('renders without crashing', async () => {
    const { getByText } = render(<ChatDashboardPage lang="en" />);

    await waitFor(() => {
      expect(getByText(/Chat dashboard/i)).toBeTruthy();
    });
  });

  it('Clear all hides the results entirely rather than auto-fetching the reset defaults (restart, not re-apply)', async () => {
    const { container } = render(<ChatDashboardPage lang="en" />);

    // Apply the default filters to mount the table and get results showing.
    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => {
      fireEvent.click(applyButton);
    });
    await waitFor(() => expect(mountedInstances.length).toBe(1));
    const firstInstance = mountedInstances[0];

    // Simulate DataTables firing its own on-mount fetch with results.
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    expect(container.querySelector('[data-testid="mock-data-table"]')).not.toBeNull();

    // Click "Clear all" (the button inside filter-actions, not the pills-row
    // one - with only default filters applied, every pill is an "info" pill,
    // so the pills-row Clear button never renders).
    const clearButton = container.querySelector('.filter-button-secondary');
    await act(async () => {
      fireEvent.click(clearButton);
    });

    // Clear all is a restart, not "apply the reset defaults": it should hide
    // the whole results block (same as before the very first Apply), not
    // silently auto-fetch and keep showing a result set the user never
    // asked for. No new table mount, no loading overlay, no lingering rows.
    expect(container.querySelector('[data-testid="mock-data-table"]')).toBeNull();
    expect(container.querySelector('.loading-overlay')).toBeNull();
    expect(mountedInstances.length).toBe(1);

    // The outgoing instance's own ajax.reload() must never be called either
    // (there's nothing to reload - the table is gone).
    expect(firstInstance.ajaxReload).not.toHaveBeenCalled();
  });

  it('a later Apply after Clear all mounts a genuinely fresh table (stale tableApiRef does not fool it into a no-op reload)', async () => {
    const { container } = render(<ChatDashboardPage lang="en" />);

    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => {
      fireEvent.click(applyButton);
    });
    await waitFor(() => expect(mountedInstances.length).toBe(1));
    const firstInstance = mountedInstances[0];

    const clearButton = container.querySelector('.filter-button-secondary');
    await act(async () => {
      fireEvent.click(clearButton);
    });
    expect(container.querySelector('[data-testid="mock-data-table"]')).toBeNull();

    // Apply again - handleApplyFilters branches on `tableApiRef.current`: if
    // Clear left it pointing at the destroyed instance, this would silently
    // call .ajax.reload() on it instead of mounting a fresh table, and
    // nothing would ever render again.
    await act(async () => {
      fireEvent.click(applyButton);
    });

    expect(container.querySelector('[data-testid="mock-data-table"]')).not.toBeNull();
    await waitFor(() => expect(mountedInstances.length).toBe(2));
    expect(firstInstance.ajaxReload).not.toHaveBeenCalled();
  });

  it('auto-closes the filter panel on a second Apply after Clear all, not just the first (regression)', async () => {
    DashboardService.getChatDashboard
      .mockResolvedValueOnce({ recordsTotal: 5, recordsFiltered: 5, data: [] })
      .mockResolvedValueOnce({ recordsTotal: 5, recordsFiltered: 5, data: [] });

    const { container } = render(<ChatDashboardPage lang="en" />);
    const getPanel = () => container.querySelector('.filter-panel');

    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });

    // First Apply: results come back (5), so the panel should auto-close.
    await act(async () => {
      fireEvent.click(applyButton);
    });
    await waitFor(() => expect(mountedInstances.length).toBe(1));
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    await waitFor(() => expect(getPanel().open).toBe(false));

    // Clear all: FilterPanel forces itself open and arms skipNextAutoClose,
    // expecting to consume it on the next hasAppliedFilters/loading-settled
    // transition. ChatDashboardPage's Clear resets hasAppliedFilters to
    // false instead of re-fetching, so that transition never happens here -
    // the skip must not linger and swallow the *next* Apply's auto-close
    // instead.
    const clearButton = container.querySelector('.filter-button-secondary');
    await act(async () => {
      fireEvent.click(clearButton);
    });
    expect(getPanel().open).toBe(true);

    // Second Apply: results come back again (5) - the panel must auto-close
    // again, the same as the first Apply did. Before the fix, the leftover
    // skip flag from Clear silently ate this close.
    await act(async () => {
      fireEvent.click(applyButton);
    });
    await waitFor(() => expect(mountedInstances.length).toBe(2));
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    await waitFor(() => expect(getPanel().open).toBe(false));
  });
});
