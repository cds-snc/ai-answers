/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, waitFor, within } from '@testing-library/react';

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key, defaultValue) => defaultValue || key
  })
}));

vi.mock('../../services/EvaluationService.js', () => ({
  default: {
    getEvalDashboard: vi.fn(() => Promise.resolve({ data: [], hasMore: false }))
  }
}));

vi.mock('../../components/admin/FilterPanel.js', () => ({
  default: () => <div data-testid="filter-panel" />
}));

vi.mock('datatables.net-react', () => {
  const MockDataTable = () => <div data-testid="data-table" />;
  MockDataTable.use = vi.fn();
  return {
    default: MockDataTable
  };
});

vi.mock('datatables.net-dt', () => ({
  default: () => null
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>
}));

describe('eval dashboard pages', () => {
  it('renders the eval dashboard without crashing', async () => {
    const { default: EvalDashboardPage } = await import('../EvalDashboardPage.js');
    const { container } = render(<EvalDashboardPage lang="en" />);

    await waitFor(() => {
      expect(within(container).getByRole('heading', { name: 'Evaluation dashboard' })).toBeTruthy();
    });
  });

  it('renders the auto-eval dashboard without crashing', async () => {
    const { default: AutoEvalDashboardPage } = await import('../AutoEvalDashboardPage.js');
    const { container } = render(<AutoEvalDashboardPage lang="en" />);

    await waitFor(() => {
      expect(within(container).getByRole('heading', { name: 'Auto-Evaluation dashboard' })).toBeTruthy();
    });
  });
});
