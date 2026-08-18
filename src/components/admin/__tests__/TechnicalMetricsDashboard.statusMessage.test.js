/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import TechnicalMetricsDashboard from '../TechnicalMetricsDashboard.js';

const mockT = (key) => key;
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
    expect(alerts[0].textContent).toBe('boom');
  });

  it('shows no alert when there are no section errors', () => {
    mockUseTechnicalMetrics.mockReturnValue({
      ...baseHook,
      errorState: { technical: null, usage: null },
    });

    render(<TechnicalMetricsDashboard lang="en" />);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
