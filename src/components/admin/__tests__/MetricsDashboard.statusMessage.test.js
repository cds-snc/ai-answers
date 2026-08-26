/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MetricsDashboard from '../MetricsDashboard.js';

const TRANSLATIONS = {
  'admin.common.fetchError': 'Failed to load data: {message}',
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockGetUsageMetrics } = vi.hoisted(() => ({ mockGetUsageMetrics: vi.fn() }));
vi.mock('../../../services/MetricsService.js', () => ({
  default: {
    getUsageMetrics: mockGetUsageMetrics,
    getSessionMetrics: vi.fn().mockResolvedValue({}),
    getExpertMetrics: vi.fn().mockResolvedValue({}),
    getAiEvalMetrics: vi.fn().mockResolvedValue({}),
    getPublicFeedbackMetrics: vi.fn().mockResolvedValue({}),
    getDepartmentMetrics: vi.fn().mockResolvedValue({}),
  },
}));

// fetchMetrics only ever runs from FilterPanel's onApplyFilters/onClearFilters
// callbacks (no auto-fetch on mount), so expose one as a clickable trigger
// instead of nulling FilterPanel out entirely.
vi.mock('../FilterPanel.js', () => ({
  default: ({ onApplyFilters }) => (
    <button onClick={() => onApplyFilters({ startDate: '2024-01-01', endDate: '2024-01-02' })}>
      trigger-apply-filters
    </button>
  ),
}));
vi.mock('../../metrics/EndUserFeedbackSection.js', () => ({ default: () => null }));

const dataTableCallCount = { current: 0 };
vi.mock('datatables.net-react', () => {
  const MockDataTable = () => {
    dataTableCallCount.current += 1;
    return null;
  };
  MockDataTable.use = vi.fn();
  return { default: MockDataTable };
});
vi.mock('datatables.net-dt', () => ({ default: () => null }));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <p>{children}</p>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

describe('MetricsDashboard StatusMessage role', () => {
  afterEach(() => {
    cleanup();
    mockGetUsageMetrics.mockReset();
    dataTableCallCount.current = 0;
  });

  it('announces a section fetch error as role="alert"', async () => {
    mockGetUsageMetrics.mockRejectedValue(new Error('usage metrics failed'));

    render(<MetricsDashboard lang="en" />);
    fireEvent.click(screen.getByText('trigger-apply-filters'));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].textContent).toBe('Failed to load data: usage metrics failed');

    const enSpan = alerts[0].querySelector('code[lang="en"]');
    expect(enSpan).toBeTruthy();
    expect(enSpan.textContent).toBe('usage metrics failed');
  });

  it('shows no alert when all sections load successfully', async () => {
    mockGetUsageMetrics.mockResolvedValue({});

    render(<MetricsDashboard lang="en" />);
    fireEvent.click(screen.getByText('trigger-apply-filters'));

    await waitFor(() => {
      expect(mockGetUsageMetrics).toHaveBeenCalled();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('suppresses all tables and shows only the info banner on a genuinely empty period', async () => {
    mockGetUsageMetrics.mockResolvedValue({ totalQuestions: 0 });

    render(<MetricsDashboard lang="en" />);
    fireEvent.click(screen.getByText('trigger-apply-filters'));

    // Settled state: the info banner is showing.
    await screen.findByText('common.noDataForFilters');
    // A section title (rendered as plain text regardless of the mocked
    // null DataTable) only exists if the tables container is mounted.
    expect(screen.queryByText('metrics.dashboard.questions.title')).toBeNull();
  });

  it('still renders the tables (and the error) when usage fails, even though that leaves totalQuestions at 0', async () => {
    // Regression test: totalQuestions comes from the 'usage' fetch, so a
    // failed 'usage' fetch alone also reads as "0 questions" — the tables
    // block must not be suppressed in that case, or the error message (and
    // any real data from the other, successful fetches) would be hidden too.
    mockGetUsageMetrics.mockRejectedValue(new Error('usage metrics failed'));

    render(<MetricsDashboard lang="en" />);
    fireEvent.click(screen.getByText('trigger-apply-filters'));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(dataTableCallCount.current).toBeGreaterThan(0);
  });

  it('shows LoadingOverlay until the first section settles, then reveals the grid', async () => {
    mockGetUsageMetrics.mockResolvedValue({ totalQuestions: 5 });

    render(<MetricsDashboard lang="en" />);
    fireEvent.click(screen.getByText('trigger-apply-filters'));

    // Synchronously right after Apply: all 6 fetches have started but none
    // has had a microtask tick to resolve yet, so only the overlay shows.
    expect(screen.getByText('admin.common.metricsLoading')).toBeTruthy();
    expect(screen.queryByText('metrics.dashboard.questions.title')).toBeNull();

    // Once every mocked fetch resolves, the overlay hands off to the grid.
    await screen.findByText('metrics.dashboard.questions.title');
    expect(screen.queryByText('admin.common.metricsLoading')).toBeNull();
  });

  it('announces one "metrics loaded" completion message, not one per section', async () => {
    mockGetUsageMetrics.mockResolvedValue({ totalQuestions: 5 });

    render(<MetricsDashboard lang="en" />);
    fireEvent.click(screen.getByText('trigger-apply-filters'));

    await screen.findByText('metrics.dashboard.loadedAnnouncement');
    // Exactly one live region exists once settled - the shared persistent
    // one - not a separate role="status" per section (SectionLoadingIndicator
    // is deliberately not a live region; see its own file comment).
    expect(screen.queryAllByRole('status').length).toBe(1);
  });
});
