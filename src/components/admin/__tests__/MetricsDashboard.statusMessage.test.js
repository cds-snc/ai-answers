/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MetricsDashboard from '../MetricsDashboard.js';

const mockT = (key) => key;
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

vi.mock('datatables.net-react', () => {
  const MockDataTable = () => null;
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
  });

  it('announces a section fetch error as role="alert"', async () => {
    mockGetUsageMetrics.mockRejectedValue(new Error('usage metrics failed'));

    render(<MetricsDashboard lang="en" />);
    fireEvent.click(screen.getByText('trigger-apply-filters'));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].textContent).toContain('usage metrics failed');
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
});
