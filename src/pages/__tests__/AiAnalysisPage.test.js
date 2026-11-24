/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: (key) => key }),
}));

vi.mock('../../components/RoleProtectedRoute.js', () => ({
  RoleProtectedRoute: ({ children }) => <>{children}</>,
}));

// Capture the FilterPanel callbacks so the test can apply filters directly.
const filterPanelProps = {};
vi.mock('../../components/admin/FilterPanel.js', () => ({
  default: (props) => {
    Object.assign(filterPanelProps, props);
    return null;
  },
}));

const sectionProps = vi.fn();
vi.mock('../../components/aiAnalysis/EvalAnalysisSection.js', () => ({
  default: (props) => {
    sectionProps(props);
    return null;
  },
}));

import AiAnalysisPage from '../AiAnalysisPage.js';

afterEach(() => {
  cleanup();
  sectionProps.mockClear();
});

describe('AiAnalysisPage', () => {
  it('states up front, before the filters, that an institution is required', () => {
    render(<AiAnalysisPage lang="en" />);
    expect(screen.getByText('admin.aiAnalysis.selectInstitution')).toBeTruthy();
    expect(sectionProps).toHaveBeenLastCalledWith(expect.objectContaining({ appliedDepartment: '' }));
  });

  it('passes the applied department and filters to the eval section, and resets them on clear', () => {
    render(<AiAnalysisPage lang="en" />);
    const filters = { department: 'TBS-SCT', startDate: '2026-11-01' };
    act(() => filterPanelProps.onApplyFilters(filters));
    expect(sectionProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ appliedDepartment: 'TBS-SCT', appliedFilters: filters })
    );
    act(() => filterPanelProps.onClearFilters({}));
    expect(sectionProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ appliedDepartment: '' })
    );
  });

  it('shows the question analysis section as coming soon, with no button', () => {
    render(<AiAnalysisPage lang="en" />);
    expect(screen.getByRole('heading', { name: 'admin.aiAnalysis.questionAnalysis.title' })).toBeTruthy();
    expect(screen.getByText('admin.aiAnalysis.questionAnalysis.comingSoon')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
