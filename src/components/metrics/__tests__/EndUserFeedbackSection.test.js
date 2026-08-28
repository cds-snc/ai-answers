/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import EndUserFeedbackSection from '../EndUserFeedbackSection.js';

vi.mock('../../../utils/dataTableLanguage.js', () => ({
  dataTableLanguage: () => ({}),
}));

// Capture what each <DataTable> was actually configured with, so the
// interactive-table wiring (paging/searching/ordering, dashboard-table
// className) can be asserted without a real datatables.net instance.
const dataTableCalls = [];
vi.mock('datatables.net-react', () => {
  const MockDataTable = (props) => {
    dataTableCalls.push(props);
    return React.createElement('table', null, props.children);
  };
  MockDataTable.use = vi.fn();
  return { default: MockDataTable };
});

vi.mock('@gcds-core/components-react', () => ({
  GcdsText: ({ children }) => React.createElement('p', null, children),
}));

const baseMetrics = {
  publicFeedbackTotals: { totalQuestionsWithFeedback: 5, enYes: 2, enNo: 1, frYes: 1, frNo: 1 },
  publicFeedbackReasons: {
    yes: { '1': { en: 2, fr: 1, total: 3 } },
    no: { unknown: { en: 1, fr: 0, total: 1 } },
  },
};

describe('EndUserFeedbackSection', () => {
  it('renders without throwing, including an "unknown" reason row for a bare yes/no with no score or reason', () => {
    dataTableCalls.length = 0;
    expect(() =>
      render(<EndUserFeedbackSection t={(k) => k} metrics={baseMetrics} lang="en" />)
    ).not.toThrow();

    const reasonsTable = dataTableCalls.find((call) => call.data?.some((row) => row.total > 0 && row.label === 'unknown'));
    expect(reasonsTable).toBeTruthy();
  });

  it('gives the reasons-breakdown table the dashboard-table CSS hooks without turning on sort/search/pagination yet', () => {
    dataTableCalls.length = 0;
    render(<EndUserFeedbackSection t={(k) => k} metrics={baseMetrics} lang="en" />);

    expect(dataTableCalls).toHaveLength(2);
    const [totalsTable, reasonsTable] = dataTableCalls;

    // Totals table: fixed 3-row summary, matches every other small fixed
    // table on MetricsDashboard.js — no dashboard-table class, features off.
    expect(totalsTable.options.paging).toBe(false);
    expect(totalsTable.options.searching).toBe(false);
    expect(totalsTable.options.ordering).toBe(false);
    expect(totalsTable.className).toBeUndefined();

    // Reasons table: variable row count that grows over time, same shape as
    // MetricsDashboard.js's Institution breakdown table — carries the same
    // CSS class so the styled search box/sort-header treatment is ready to
    // go, but paging/searching/ordering stay off deliberately until that's
    // actually wanted (no layout either, since it only does anything once
    // search/sort are on). initComplete is the one exception: it wires
    // scope="col" on the headers (WCAG 1.3.1), which every table needs.
    expect(reasonsTable.className).toBe('display dashboard-table zebra-stable-on-hover');
    expect(reasonsTable.options.paging).toBe(false);
    expect(reasonsTable.options.searching).toBe(false);
    expect(reasonsTable.options.ordering).toBe(false);
    expect(reasonsTable.options.layout).toBeUndefined();
    expect(reasonsTable.options.initComplete).toBeTypeOf('function');
  });
});
