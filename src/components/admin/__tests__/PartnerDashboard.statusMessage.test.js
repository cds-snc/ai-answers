/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import PartnerDashboard from '../PartnerDashboard.js';

const mockT = (key) => key;
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockUseDashboardMetrics } = vi.hoisted(() => ({ mockUseDashboardMetrics: vi.fn() }));
vi.mock('../../../hooks/admin/useDashboardMetrics.js', () => ({
  useDashboardMetrics: mockUseDashboardMetrics,
}));

vi.mock('../FilterPanel.js', () => ({ default: () => null }));
vi.mock('../dashboard/StatCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/DonutCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/HBarCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/StackedBarCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/DivergingBarCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/ReferralUrlsCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/CitationPagesCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/AnswerTypesCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/ContentIssueChatsCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/CollapsibleCard.js', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../dashboard/EvalAnalysisSection.js', () => ({ default: () => null }));
vi.mock('../dashboard/NoDataCard.js', () => ({ default: () => null }));

describe('PartnerDashboard StatusMessage role', () => {
  afterEach(() => {
    cleanup();
    mockUseDashboardMetrics.mockReset();
  });

  it('announces a fetch error as role="alert"', async () => {
    mockUseDashboardMetrics.mockReturnValue({
      metrics: {},
      loading: false,
      error: 'boom',
      fetchMetrics: vi.fn(),
    });

    render(<PartnerDashboard lang="en" />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('partnerDashboard.error');
  });

  it('shows no alert when there is no error', () => {
    mockUseDashboardMetrics.mockReturnValue({
      metrics: {},
      loading: false,
      error: null,
      fetchMetrics: vi.fn(),
    });

    render(<PartnerDashboard lang="en" />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the full-page loading-overlay while fetching (filter-driven fetch)', () => {
    mockUseDashboardMetrics.mockReturnValue({
      metrics: {},
      loading: true,
      error: null,
      fetchMetrics: vi.fn(),
    });

    const { container } = render(<PartnerDashboard lang="en" />);

    expect(container.querySelector('.loading-overlay')).toBeTruthy();
    expect(container.querySelector('.dashboard-loading')).toBeNull();
  });
});
