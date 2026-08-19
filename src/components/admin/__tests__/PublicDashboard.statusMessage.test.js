/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import PublicDashboard from '../PublicDashboard.js';

const mockT = (key) => key;
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockUseDashboardMetrics } = vi.hoisted(() => ({ mockUseDashboardMetrics: vi.fn() }));
vi.mock('../../../hooks/admin/useDashboardMetrics.js', () => ({
  useDashboardMetrics: mockUseDashboardMetrics,
}));

vi.mock('../DashboardFilterBar.js', () => ({ default: () => null }));
vi.mock('../dashboard/StatCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/DonutCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/HBarCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/StackedBarCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/NoDataCard.js', () => ({ default: () => null }));

describe('PublicDashboard StatusMessage role', () => {
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

    render(<PublicDashboard lang="en" />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('publicDashboard.error');
  });

  it('shows no alert when there is no error', () => {
    mockUseDashboardMetrics.mockReturnValue({
      metrics: {},
      loading: false,
      error: null,
      fetchMetrics: vi.fn(),
    });

    render(<PublicDashboard lang="en" />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the full-page loading-overlay while fetching (filter-driven fetch)', () => {
    mockUseDashboardMetrics.mockReturnValue({
      metrics: {},
      loading: true,
      error: null,
      fetchMetrics: vi.fn(),
    });

    const { container } = render(<PublicDashboard lang="en" />);

    expect(container.querySelector('.loading-overlay')).toBeTruthy();
    expect(container.querySelector('.dashboard-loading')).toBeNull();
  });
});
