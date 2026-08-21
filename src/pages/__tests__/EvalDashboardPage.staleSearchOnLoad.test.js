/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import EvalDashboardPage from '../EvalDashboardPage.js';
import EvaluationService from '../../services/EvaluationService.js';

// Regression: a previously typed search term surviving a page refresh reads
// as the search box being "stuck" - stateSave persists the whole DataTables
// state (page length, sort, column order, AND the search term) across
// reloads, and once the search box was surfaced before Apply (see
// EvalDashboardPage.searchBeforeApply.test.js), a restored search term would
// immediately re-fire a real query too. A stale sort column has the same
// "stuck" problem - it silently overrides the default display order with
// nothing on screen indicating a non-default sort is active. Same fix as
// ChatDashboardPage.js's stateLoadCallback: strip the search AND order
// portions, keep the rest (e.g. page length).
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key, defaultValue) => defaultValue || key
  })
}));

vi.mock('../../services/EvaluationService.js', () => ({
  default: {
    getEvalDashboard: vi.fn(() => Promise.resolve({ data: [], hasMore: false }))
  }
}));

let lastOptions = null;
vi.mock('datatables.net-react', () => {
  const MockDataTable = (props) => {
    lastOptions = props.options;
    return React.createElement('div', { 'data-testid': 'mock-data-table' });
  };
  MockDataTable.use = vi.fn();
  return { default: MockDataTable };
});

vi.mock('datatables.net-dt', () => ({
  default: () => null
}));

vi.mock('../../components/admin/FilterPanel.js', () => ({
  default: () => React.createElement('div', { 'data-testid': 'filter-panel' })
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsIcon: () => <span aria-hidden="true" />
}));

describe('EvalDashboardPage - does not restore a stale search term on page load', () => {
  afterEach(() => {
    cleanup();
    lastOptions = null;
    window.localStorage.clear();
  });

  it('strips the search portion of a persisted DataTables state, keeping the rest', async () => {
    // Get lastOptions populated first (need the table mounted, which
    // requires Apply), so we can read the real stateLoadCallback it wires
    // up. The key format is the component's own TABLE_STORAGE_KEY + lang.
    EvaluationService.getEvalDashboard.mockResolvedValueOnce({ data: [{ chatId: 'seed' }], hasMore: false });
    const { container } = render(<EvalDashboardPage lang="en" />);
    fireEvent.change(container.querySelector('#eval-quick-search-input'), { target: { value: 'seed' } });
    await act(async () => {
      fireEvent.submit(container.querySelector('.eval-quick-search form'));
    });
    await waitFor(() => expect(lastOptions).toBeTruthy());

    const storageKey = 'evalDashboard_tableState_v3_en';
    const persisted = { search: { search: 'stale-chat-id' }, order: [[3, 'asc']], length: 25 };
    window.localStorage.setItem(storageKey, JSON.stringify(persisted));

    const loaded = lastOptions.stateLoadCallback();

    expect(loaded.search.search).toBe('');
    // Sort is stripped too - a stale sort column shouldn't silently
    // override the table's default display order on refresh.
    expect(loaded.order).toBeUndefined();
    // Page length isn't touched - that persistence is still wanted.
    expect(loaded.length).toBe(25);
  });
});
