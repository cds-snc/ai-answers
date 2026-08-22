/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import EvalDashboardPage from '../EvalDashboardPage.js';
import EvaluationService from '../../services/EvaluationService.js';

// Regression coverage for surfacing "Find by Chat ID" before any filter
// Apply: only the standalone chat ID search input should show at that point,
// not the whole table (columns, per-column filters, pagination) - that
// reads as confusing/broken before there's anything to show. Submitting it
// runs a lightweight pre-check; a match applies the default filters and
// seeds the real table's search box with whatever was typed, while no
// match says so inline instead of opening an empty table.
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

const submitChatIdSearch = async (container, value) => {
  fireEvent.change(container.querySelector('#eval-search-chat-id-input'), { target: { value } });
  await act(async () => {
    fireEvent.submit(container.querySelector('.eval-search-chat-id form'));
  });
};

describe('EvalDashboardPage - search-by-ID surfaced before Apply', () => {
  afterEach(() => {
    cleanup();
    lastOptions = null;
  });

  it('shows only the standalone chat ID search input before Apply, not the full table', () => {
    const { container } = render(<EvalDashboardPage lang="en" />);

    expect(container.querySelector('#eval-search-chat-id-input')).not.toBeNull();
    expect(container.querySelector('[data-testid="mock-data-table"]')).toBeNull();
  });

  it('submitting a match mounts the table, seeded with the typed search term', async () => {
    EvaluationService.getEvalDashboard.mockResolvedValueOnce({ data: [{ chatId: 'abc123' }], hasMore: false });

    const { container } = render(<EvalDashboardPage lang="en" />);
    await submitChatIdSearch(container, 'abc123');

    await waitFor(() => {
      expect(container.querySelector('[data-testid="mock-data-table"]')).not.toBeNull();
    });
    expect(lastOptions?.search).toEqual({ search: 'abc123' });

    // The standalone box is gone once the real table (with its own search
    // box) takes over.
    expect(container.querySelector('#eval-search-chat-id-input')).toBeNull();
  });

  it('searches all time, unscoped to any date range, not just the default last 7 days', async () => {
    EvaluationService.getEvalDashboard.mockResolvedValueOnce({ data: [{ chatId: 'old-chat' }], hasMore: false });

    const { container } = render(<EvalDashboardPage lang="en" />);
    await submitChatIdSearch(container, 'old-chat');

    const [query] = EvaluationService.getEvalDashboard.mock.calls[0];
    expect(query.filterType).toBe('preset');
    expect(query.presetValue).toBe('all');
    expect(query.startDate).toBeUndefined();
    expect(query.endDate).toBeUndefined();

    // The table that opens on a match must keep searching that same
    // unscoped range, not silently fall back to the default 7 days (which
    // would immediately hide the very match just confirmed to exist).
    await waitFor(() => expect(lastOptions).toBeTruthy());
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: 'old-chat' }, order: [], draw: 1 }, vi.fn());
    });
    const lastCall = EvaluationService.getEvalDashboard.mock.calls.at(-1)[0];
    expect(lastCall.filterType).toBe('preset');
    expect(lastCall.presetValue).toBe('all');
  });

  it('submitting a non-matching ID shows a not-found message instead of opening an empty table', async () => {
    EvaluationService.getEvalDashboard.mockResolvedValueOnce({ data: [], hasMore: false });

    const { container, getByText } = render(<EvalDashboardPage lang="en" />);
    await submitChatIdSearch(container, 'no-such-id');

    expect(container.querySelector('[data-testid="mock-data-table"]')).toBeNull();
    expect(getByText('admin.evalDashboard.searchNotFound')).toBeTruthy();
    // The box stays up so the user can try again immediately.
    expect(container.querySelector('#eval-search-chat-id-input')).not.toBeNull();
  });

  it('clears the not-found message as soon as the user edits the search again', async () => {
    EvaluationService.getEvalDashboard.mockResolvedValueOnce({ data: [], hasMore: false });

    const { container, queryByText } = render(<EvalDashboardPage lang="en" />);
    await submitChatIdSearch(container, 'no-such-id');
    expect(queryByText('admin.evalDashboard.searchNotFound')).toBeTruthy();

    fireEvent.change(container.querySelector('#eval-search-chat-id-input'), { target: { value: 'no-such-id2' } });

    expect(queryByText('admin.evalDashboard.searchNotFound')).toBeNull();
  });

  it('shows a validation error on an empty submit instead of querying, and clears it once the user types', async () => {
    const { container, getByText, queryByText } = render(<EvalDashboardPage lang="en" />);

    await act(async () => {
      fireEvent.submit(container.querySelector('.eval-search-chat-id form'));
    });

    expect(EvaluationService.getEvalDashboard).not.toHaveBeenCalled();
    expect(getByText('admin.common.chatIdRequired')).toBeTruthy();
    expect(container.querySelector('#eval-search-chat-id-input').getAttribute('aria-describedby')).toBe('eval-search-chat-id-error');

    fireEvent.change(container.querySelector('#eval-search-chat-id-input'), { target: { value: 'abc' } });

    expect(queryByText('admin.common.chatIdRequired')).toBeNull();
  });
});
