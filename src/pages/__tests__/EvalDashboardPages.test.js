/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, waitFor, within } from '@testing-library/react';

let lastDataTableProps = null;

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
  default: ({ onApplyFilters }) => {
    const didApplyRef = React.useRef(false);
    React.useEffect(() => {
      if (didApplyRef.current) return;
      didApplyRef.current = true;
      onApplyFilters?.({});
    }, [onApplyFilters]);
    return <div data-testid="filter-panel" />;
  }
}));

vi.mock('datatables.net-react', () => {
  const MockDataTable = (props) => {
    lastDataTableProps = props;
    return <div data-testid="data-table" />;
  };
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
    lastDataTableProps = null;
    const { default: EvalDashboardPage } = await import('../EvalDashboardPage.js');
    const { container } = render(<EvalDashboardPage lang="en" />);

    await waitFor(() => {
      expect(within(container).getByRole('heading', { name: 'Evaluation dashboard' })).toBeTruthy();
    });

    await waitFor(() => {
      expect(lastDataTableProps).toBeTruthy();
    });

    expect(lastDataTableProps?.options?.layout).toEqual({
      topStart: 'search',
      topEnd: 'pageLength',
      bottomStart: 'info',
      bottomEnd: 'paging'
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
