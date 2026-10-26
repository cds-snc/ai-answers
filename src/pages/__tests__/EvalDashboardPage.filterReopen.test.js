/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import EvalDashboardPage from '../EvalDashboardPage.js';
import EvaluationService from '../../services/EvaluationService.js';

// Uses the real FilterPanel (unlike EvalDashboardPages.test.js's smoke test,
// which mocks it away) so this can actually observe its open/closed
// <details> state - the whole point of this regression.
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

// Closer-to-real DataTables mock (same pattern as ChatDashboardPage.test.js):
// captures the latest `options` so a test can call `ajax` directly, and
// fires `initComplete` once per mount bound to a minimal fake settings/api.
let lastOptions = null;
vi.mock('datatables.net-react', () => {
  const MockDataTable = (props) => {
    lastOptions = props.options;
    const firedRef = React.useRef(false);
    if (!firedRef.current) {
      firedRef.current = true;
      const settings = {
        api: () => ({
          columns: () => ({ every: () => {} })
        })
      };
      props.options?.initComplete?.call(settings);
    }
    return React.createElement('div', { 'data-testid': 'mock-data-table' });
  };
  MockDataTable.use = vi.fn();
  return { default: MockDataTable };
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

describe('EvalDashboardPage - filter panel reopen on zero-result search (regression)', () => {
  afterEach(() => {
    cleanup();
    lastOptions = null;
  });

  it('does not reopen the filter panel when a global chat-ID search yields zero results', async () => {
    const { container } = render(<EvalDashboardPage lang="en" />);
    const getPanel = () => container.querySelector('.filter-panel');

    const applyButton = await waitFor(() => {
      const btn = container.querySelector('#filter-apply-button');
      if (!btn) throw new Error('apply button not rendered yet');
      return btn;
    });
    await act(async () => {
      fireEvent.click(applyButton);
    });
    await waitFor(() => expect(lastOptions).toBeTruthy());

    // Simulate DataTables' own on-mount fetch, with a real result so the
    // panel auto-closes first (establishing the "settled, closed" baseline
    // this regression is about breaking).
    EvaluationService.getEvalDashboard.mockResolvedValueOnce({ data: [{ chatId: 'abc' }], hasMore: false });
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: '' }, order: [], draw: 1 }, vi.fn());
    });
    await waitFor(() => expect(getPanel().open).toBe(false));

    // Simulate typing a chat/interaction ID that matches nothing.
    EvaluationService.getEvalDashboard.mockResolvedValueOnce({ data: [], hasMore: false });
    await act(async () => {
      await lastOptions.ajax({ start: 0, length: 10, search: { value: 'no-such-chat-id' }, order: [], draw: 2 }, vi.fn());
    });

    // A zero-result search must NOT reopen the panel - that's FilterPanel's
    // own "the applied filters returned nothing" signal, which doesn't
    // apply here (the filters are fine; the search term just didn't
    // match). Without a searchTerm-aware guard on filterResultCount,
    // pageResultCount hitting 0 forced the panel back open.
    expect(getPanel().open).toBe(false);
  });
});
