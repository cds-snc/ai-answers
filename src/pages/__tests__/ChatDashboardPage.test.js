/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import ChatDashboardPage from '../ChatDashboardPage.js';

// Mock dependencies
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key, defaultValue) => defaultValue || key
  })
}));

vi.mock('../../services/DashboardService.js', () => ({
  default: {
    getChatDashboard: vi.fn(() => Promise.resolve({
      recordsTotal: 0,
      recordsFiltered: 0,
      data: []
    }))
  }
}));

vi.mock('datatables.net-react', () => {
  const MockDataTable = () => null;
  MockDataTable.use = vi.fn();
  return {
    default: MockDataTable
  };
});

vi.mock('datatables.net-dt', () => ({
  default: () => null
}));

vi.mock('@cdssnc/gcds-components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>
}));

describe('ChatDashboardPage rendering', () => {
  it('renders without crashing', async () => {
    const { getByText } = render(<ChatDashboardPage lang="en" />);

    await waitFor(() => {
      expect(getByText(/Chat dashboard/i)).toBeTruthy();
    });
  });
});
