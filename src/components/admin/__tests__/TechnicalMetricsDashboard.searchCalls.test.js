/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import TechnicalMetricsDashboard from '../TechnicalMetricsDashboard.js';

const TRANSLATIONS = {
  'technicalMetrics.dashboard.searchCalls.provider.title': 'Provider',
  'technicalMetrics.dashboard.searchCalls.provider.canadaca': 'Canada.ca search (Coveo)',
  'technicalMetrics.dashboard.searchCalls.provider.google': 'Google',
  'technicalMetrics.dashboard.aiServiceCalls.type.title': 'Call type',
  'technicalMetrics.dashboard.aiServiceCalls.type.context': 'Context call',
  'technicalMetrics.dashboard.aiServiceCalls.type.answer': 'Answer call',
  'metrics.dashboard.tokens.googleSearches': 'Google search queries',
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockUseTechnicalMetrics } = vi.hoisted(() => ({ mockUseTechnicalMetrics: vi.fn() }));
vi.mock('../../../hooks/admin/useTechnicalMetrics.js', () => ({
  useTechnicalMetrics: mockUseTechnicalMetrics,
}));

vi.mock('../FilterPanel.js', () => ({ default: () => null }));

// Capture every <DataTable> call's props so table content can be asserted
// without depending on the real datatables.net DOM rendering.
const dataTableCalls = [];
vi.mock('datatables.net-react', () => {
  const MockDataTable = (props) => {
    dataTableCalls.push(props);
    return null;
  };
  MockDataTable.use = vi.fn();
  return { default: MockDataTable };
});
vi.mock('datatables.net-dt', () => ({ default: () => null }));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

const baseHook = {
  data: {
    responseTime: {},
    downloadWebPage: [],
    searchCalls: {
      canadaca: { errors: 2, retries: 5 },
      google: { errors: 1, retries: 0 },
    },
    aiServiceCalls: {
      context: { errors: 3 },
      answer: { errors: 0 },
    },
    totalQuestions: 100,
    totalInputTokens: 0,
    totalOutputTokens: 0,
  },
  errorState: { technical: null, usage: null, blocked: null },
  handleApplyFilters: vi.fn(),
  handleClearFilters: vi.fn(),
  hasStartedLoading: true,
  // Fetches have already resolved (data/errorState are populated) - true
  // reflects that, same as TechnicalMetricsDashboard.statusMessage.test.js's
  // baseHook. Without it, the component's LoadingOverlay-until-first-settle
  // gate never releases and every test here fails looking for a table.
  hasAnySectionSettled: true,
  loadingState: { technical: false, usage: false, blocked: false },
};

describe('TechnicalMetricsDashboard search calls + AI service errors', () => {
  afterEach(() => {
    cleanup();
    mockUseTechnicalMetrics.mockReset();
    dataTableCalls.length = 0;
  });

  it('shows one row per search provider with error/retry counts, no retry percentage', () => {
    mockUseTechnicalMetrics.mockReturnValue(baseHook);

    render(<TechnicalMetricsDashboard lang="en" />);

    const searchTable = dataTableCalls.find((call) =>
      call.data?.some((row) => row.provider === 'Canada.ca search (Coveo)')
    );
    expect(searchTable).toBeTruthy();
    expect(searchTable.data).toEqual([
      expect.objectContaining({ provider: 'Canada.ca search (Coveo)', errorCount: '2', retryCount: '5' }),
      expect.objectContaining({ provider: 'Google', errorCount: '1', retryCount: '0' }),
    ]);
    // No retry-rate column: a single question's search can retry more than
    // once, so "retries / totalQuestions" can exceed 100% and would mislead.
    expect(searchTable.data[0].retryPercent).toBeUndefined();
  });

  it('defaults to zero for a provider with no recorded events', () => {
    mockUseTechnicalMetrics.mockReturnValue({
      ...baseHook,
      data: { ...baseHook.data, searchCalls: {} },
    });

    render(<TechnicalMetricsDashboard lang="en" />);

    const searchTable = dataTableCalls.find((call) =>
      call.data?.some((row) => row.provider === 'Google')
    );
    expect(searchTable.data).toEqual([
      expect.objectContaining({ errorCount: '0', retryCount: '0' }),
      expect.objectContaining({ errorCount: '0', retryCount: '0' }),
    ]);
  });

  it('shows AI context/answer call errors in their own table, not the tokens table', () => {
    mockUseTechnicalMetrics.mockReturnValue(baseHook);

    render(<TechnicalMetricsDashboard lang="en" />);

    const aiTable = dataTableCalls.find((call) =>
      call.data?.some((row) => row.callType === 'Context call')
    );
    expect(aiTable).toBeTruthy();
    expect(aiTable.data).toEqual([
      expect.objectContaining({ callType: 'Context call', errorCount: '3' }),
      expect.objectContaining({ callType: 'Answer call', errorCount: '0' }),
    ]);

    // The tokens table (identified by its googleSearches row) no longer
    // carries AI-error rows — that data comes from the 'technical' fetch,
    // but the tokens table is gated on 'usage'.
    const tokensTable = dataTableCalls.find((call) =>
      call.data?.some((row) => row.metric === 'Google search queries')
    );
    expect(tokensTable).toBeTruthy();
    expect(tokensTable.data.some((row) => row.metric === 'AI context call errors')).toBe(false);
    expect(tokensTable.data.some((row) => row.metric === 'AI answer call errors')).toBe(false);
  });

  it('surfaces a technical-fetch error on the search-calls and AI-calls sections, even though their rate columns depend on usage data', () => {
    mockUseTechnicalMetrics.mockReturnValue({
      ...baseHook,
      errorState: { technical: 'technical fetch failed', usage: null, blocked: null },
    });

    render(<TechnicalMetricsDashboard lang="en" />);

    // Both new tables must be gated on technical (their own data source),
    // not only on usage (only the source of the rate denominator) — a
    // 'technical' failure must not be hidden as a silent "0 errors" row.
    const alerts = Array.from(document.querySelectorAll('.status-message--error-box'));
    expect(alerts.some((a) => a.textContent.includes('technical fetch failed'))).toBe(true);
  });

  it('surfaces a usage-fetch error on the search-calls and AI-calls sections too, since their rates depend on usage data', () => {
    mockUseTechnicalMetrics.mockReturnValue({
      ...baseHook,
      errorState: { technical: null, usage: 'usage fetch failed', blocked: null },
    });

    render(<TechnicalMetricsDashboard lang="en" />);

    const alerts = Array.from(document.querySelectorAll('.status-message--error-box'));
    expect(alerts.some((a) => a.textContent.includes('usage fetch failed'))).toBe(true);
  });
});
