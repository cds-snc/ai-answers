/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import TechnicalMetricsDashboard from '../TechnicalMetricsDashboard.js';
import { waitForAnnouncement } from '../../../../test/liveAnnouncer.js';
import { getAnnouncedTexts } from '../../../utils/liveAnnouncer.js';

const TRANSLATIONS = {
  'admin.common.fetchError': 'Failed to load data: {error}',
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

vi.mock('datatables.net-react', () => {
  const MockDataTable = () => null;
  MockDataTable.use = vi.fn();
  return { default: MockDataTable };
});
vi.mock('datatables.net-dt', () => ({ default: () => null }));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

const baseHook = {
  data: { responseTime: {}, downloadWebPage: [] },
  handleApplyFilters: vi.fn(),
  handleClearFilters: vi.fn(),
  hasStartedLoading: true,
  // These tests all model a state where fetches have already resolved
  // (errorState/data are populated) — hasAnySectionSettled: true reflects
  // that, matching the LoadingOverlay-then-grid handoff in
  // TechnicalMetricsDashboard.js/useTechnicalMetrics.js.
  hasAnySectionSettled: true,
  loadingState: {},
};

describe('TechnicalMetricsDashboard StatusMessage role', () => {
  afterEach(() => {
    cleanup();
    mockUseTechnicalMetrics.mockReset();
  });

  it('announces a section fetch error as role="alert"', async () => {
    mockUseTechnicalMetrics.mockReturnValue({
      ...baseHook,
      errorState: { technical: 'boom', usage: null },
    });

    render(<TechnicalMetricsDashboard lang="en" />);

    await waitForAnnouncement('Failed to load data: boom', 'assertive', { exact: true });
    const box = document.querySelector('.status-message--error-box');
    expect(box.textContent).toBe('Failed to load data: boom');

    const enSpan = box.querySelector('code[lang="en"]');
    expect(enSpan).toBeTruthy();
    expect(enSpan.textContent).toBe('boom');
  });

  it('shows no alert when there are no section errors', () => {
    mockUseTechnicalMetrics.mockReturnValue({
      ...baseHook,
      errorState: { technical: null, usage: null },
    });

    render(<TechnicalMetricsDashboard lang="en" />);

    expect(document.querySelector('.status-message--error-box')).toBeNull();
  });

  it('suppresses all tables and shows only the info banner on a genuinely empty period', () => {
    mockUseTechnicalMetrics.mockReturnValue({
      ...baseHook,
      data: { ...baseHook.data, totalQuestions: 0 },
      errorState: { technical: null, usage: null },
    });

    render(<TechnicalMetricsDashboard lang="en" />);

    expect(screen.getByText('common.noDataForFilters')).toBeTruthy();
    expect(screen.queryByText('technicalMetrics.dashboard.responseTime.title')).toBeNull();
  });

  it('still renders the tables (and the error) when a section errors, even though that leaves totalQuestions at 0', () => {
    // Regression test: totalQuestions comes from the 'usage' fetch, so a
    // failed fetch alone also reads as "0 questions" — the tables block
    // must not be suppressed in that case, or the error message (and any
    // real data from other, successful fetches) would be hidden too.
    mockUseTechnicalMetrics.mockReturnValue({
      ...baseHook,
      data: { ...baseHook.data, totalQuestions: 0 },
      errorState: { technical: 'boom', usage: null },
    });

    render(<TechnicalMetricsDashboard lang="en" />);

    expect(document.querySelectorAll('.status-message--error-box').length).toBeGreaterThan(0);
    expect(screen.getByText('technicalMetrics.dashboard.responseTime.title')).toBeTruthy();
  });

  it('renders all 5 sections without a sectionKey collision when technical and usage both error', () => {
    // Regression for the sectionKey fix: all 5 SectionWrapper instances
    // share one useErrorStatus() hook instance, so erroring 'technical' and
    // 'usage' together (5 boxes in one render) used to collide on the
    // 'default' renderStatusMessage key.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUseTechnicalMetrics.mockReturnValue({
      ...baseHook,
      errorState: { technical: 'boom', usage: 'also boom' },
    });

    render(<TechnicalMetricsDashboard lang="en" />);

    expect(document.querySelectorAll('.status-message--error-box').length).toBe(5);
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('in the same render'));
    errorSpy.mockRestore();
  });

  it('does not re-announce still-failed sections when the dashboard re-renders for an unrelated reason', async () => {
    // Regression, same fix as MetricsDashboard.js: SectionWrapper is a
    // module-level component and each section's status is memoized on its
    // error string, so a re-render that changes nothing about a section's
    // error (a sibling settling) neither remounts its StatusMessage nor
    // bumps its nonce. 'technical' feeds 4 sections, all announcing the
    // same text one at a time (liveAnnouncer.js GAP_MS) — wait for all 4
    // before re-rendering so a still-queued one can't be mistaken for a
    // re-announce.
    const failed = { technical: 'boom', usage: null };
    const announced = () => getAnnouncedTexts('assertive').filter((text) => text === 'Failed to load data: boom');
    mockUseTechnicalMetrics.mockReturnValue({ ...baseHook, errorState: failed });

    const { rerender } = render(<TechnicalMetricsDashboard lang="en" />);
    await waitFor(() => expect(announced()).toHaveLength(4), { timeout: 4000 });

    // Same error strings, new loadingState/errorState objects — what the
    // hook's own state update looks like when an unrelated section settles.
    mockUseTechnicalMetrics.mockReturnValue({ ...baseHook, loadingState: { usage: false }, errorState: { ...failed } });
    rerender(<TechnicalMetricsDashboard lang="en" />);
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(announced()).toHaveLength(4);
  });
});
