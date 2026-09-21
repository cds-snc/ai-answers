/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { waitForAnnouncement } from '../../../../test/liveAnnouncer.js';
import { getAnnouncedTexts } from '../../../utils/liveAnnouncer.js';
import MetricsDashboard from '../MetricsDashboard.js';

const TRANSLATIONS = {
  'admin.common.fetchError': 'Failed to load data: {error}',
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockGetUsageMetrics, mockGetDepartmentMetrics } = vi.hoisted(() => ({
  mockGetUsageMetrics: vi.fn(),
  mockGetDepartmentMetrics: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../services/MetricsService.js', () => ({
  default: {
    getUsageMetrics: mockGetUsageMetrics,
    getSessionMetrics: vi.fn().mockResolvedValue({}),
    getExpertMetrics: vi.fn().mockResolvedValue({}),
    getAiEvalMetrics: vi.fn().mockResolvedValue({}),
    getPublicFeedbackMetrics: vi.fn().mockResolvedValue({}),
    getDepartmentMetrics: mockGetDepartmentMetrics,
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
    mockGetDepartmentMetrics.mockReset().mockResolvedValue({});
    dataTableCallCount.current = 0;
  });

  it('announces a section fetch error as role="alert"', async () => {
    mockGetUsageMetrics.mockRejectedValue(new Error('usage metrics failed'));

    render(<MetricsDashboard lang="en" />);
    fireEvent.click(screen.getByText('trigger-apply-filters'));

    await waitForAnnouncement('Failed to load data: usage metrics failed', 'assertive', { exact: true });
    const box = document.querySelector('.status-message--error-box');
    expect(box.textContent).toBe('Failed to load data: usage metrics failed');

    const enSpan = box.querySelector('code[lang="en"]');
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
    expect(document.querySelector('.status-message--error-box')).toBeNull();
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

    await waitFor(() => expect(document.querySelector('.status-message--error-box')).toBeTruthy());
    expect(dataTableCallCount.current).toBeGreaterThan(0);
  });

  it('renders all 3 affected sections without a sectionKey collision when usage errors', async () => {
    // Regression for the sectionKey fix: a single failed 'usage' fetch feeds
    // 3 different SectionWrapper instances (questions, accuracy,
    // questionTypes) off one useErrorStatus() hook instance — these used to
    // collide on the 'default' renderStatusMessage key.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetUsageMetrics.mockRejectedValue(new Error('usage metrics failed'));

    render(<MetricsDashboard lang="en" />);
    fireEvent.click(screen.getByText('trigger-apply-filters'));

    await waitFor(() => {
      expect(document.querySelectorAll('.status-message--error-box').length).toBe(3);
    });
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('in the same render'));
    errorSpy.mockRestore();
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

    await waitForAnnouncement('admin.common.resultsLoaded', 'assertive');
    // No role="status" per section (SectionLoadingIndicator is deliberately
    // not a live region; see its own file comment) - the only live regions
    // are the site-wide ones (liveAnnouncer.js).
    expect(document.querySelectorAll('[role="status"]:not([data-live-announcer])').length).toBe(0);
  });

  it('does not re-announce a still-failed section when an unrelated sibling section settles later', async () => {
    // Regression: SectionWrapper used to call buildErrorStatus() inline in
    // JSX, producing a fresh object on every dashboard re-render —
    // renderStatusMessage's identity-based nonce bumped (and re-announced)
    // on any sibling section's settle, not just when this section's own
    // error changed. Fixed by memoizing each section's status, keyed on its
    // error string.
    //
    // Uses getDepartmentMetrics's failure specifically because 'dept' is
    // the errorState key exactly one SectionWrapper ('dept') reads — unlike
    // 'usage', which also feeds the 'questions'/'accuracy'/'questionTypes'
    // sections with the identical announced text, which would make a
    // second, legitimate announcement (queued behind liveAnnouncer.js's
    // GAP_MS from those other boxes) indistinguishable from a re-announce.
    mockGetDepartmentMetrics.mockRejectedValue(new Error('dept metrics failed'));
    let resolveUsage;
    mockGetUsageMetrics.mockReturnValue(new Promise((resolve) => { resolveUsage = resolve; }));

    render(<MetricsDashboard lang="en" />);
    fireEvent.click(screen.getByText('trigger-apply-filters'));

    await waitForAnnouncement('Failed to load data: dept metrics failed', 'assertive', { exact: true });

    // Let 'usage' settle well after 'dept' already failed and announced —
    // its own state update re-renders the whole dashboard while the dept
    // error box is still showing.
    resolveUsage({ totalQuestions: 5 });
    // Past liveAnnouncer.js's GAP_MS (400ms) so a genuinely re-queued
    // announcement would have landed in the DOM by now, not just be queued.
    await new Promise((resolve) => setTimeout(resolve, 600));

    const announcements = getAnnouncedTexts('assertive').filter(
      (text) => text === 'Failed to load data: dept metrics failed'
    );
    expect(announcements).toHaveLength(1);
  });
});
