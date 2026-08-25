/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import TechnicalMetricsDashboard from '../TechnicalMetricsDashboard.js';

const TRANSLATIONS = {
  'admin.common.fetchError': 'Failed to load data: {message}',
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

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].textContent).toBe('Failed to load data: boom');

    const enSpan = alerts[0].querySelector('span[lang="en"]');
    expect(enSpan).toBeTruthy();
    expect(enSpan.textContent).toBe('boom');
  });

  it('shows no alert when there are no section errors', () => {
    mockUseTechnicalMetrics.mockReturnValue({
      ...baseHook,
      errorState: { technical: null, usage: null },
    });

    render(<TechnicalMetricsDashboard lang="en" />);

    expect(screen.queryByRole('alert')).toBeNull();
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

    expect(screen.queryAllByRole('alert').length).toBeGreaterThan(0);
    expect(screen.getByText('technicalMetrics.dashboard.responseTime.title')).toBeTruthy();
  });
});
