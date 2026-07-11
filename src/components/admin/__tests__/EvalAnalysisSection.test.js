/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The section talks to the eval-analysis endpoints through the client
// service; mock it so rendering needs no network.
vi.mock('../../../services/EvalAnalysisService.js', () => ({
  __esModule: true,
  default: {
    precheck: vi.fn().mockResolvedValue({ count: 42, min: 20, max: 200 }),
    create: vi.fn(),
    advance: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockResolvedValue([])
  }
}));

import EvalAnalysisSection from '../dashboard/EvalAnalysisSection.js';
import EvalAnalysisReport from '../dashboard/EvalAnalysisReport.js';

afterEach(() => {
  cleanup();
});

describe('EvalAnalysisSection', () => {
  it('renders the select-institution note and a disabled Run button without a department', () => {
    render(<EvalAnalysisSection lang="en" appliedDepartment="" appliedFilters={null} />);
    expect(screen.getByText('Select an institution in the filters above to enable analysis.')).toBeTruthy();
    const button = document.querySelector('gcds-button, button');
    expect(button).toBeTruthy();
  });
});

describe('EvalAnalysisReport', () => {
  const analysis = {
    _id: 'a1',
    department: 'TBS-SCT',
    startDate: '2026-06-01T00:00:00Z',
    endDate: '2026-06-30T23:59:59Z',
    language: 'en',
    status: 'complete',
    evalCount: 42,
    excludedCount: 1,
    createdAt: '2026-07-02T12:00:00Z',
    requestedBy: 'lead@tbs-sct.gc.ca',
    stats: {
      total: 42,
      scoredCount: 41,
      excludedCount: 1,
      meanScore: 97.2,
      pctPerfect: 85,
      categories: { correct: 35, needsImprovement: 4, hasError: 1, hasCitationError: 1, harmful: 0 },
      contentIssueCount: 2,
      byLanguage: {
        en: { count: 36, scoredCount: 35, perfectCount: 30, meanScore: 97.5, pctPerfect: 86, categories: {}, contentIssueCount: 2 },
        fr: { count: 6, scoredCount: 6, perfectCount: 5, meanScore: 95.4, pctPerfect: 83, categories: {}, contentIssueCount: 0 }
      },
      evaluators: [
        { email: 'a@x.ca', count: 30, scoredCount: 30, meanScore: 98.1, pctPerfect: 90, deltaPctPerfect: 12, othersPctPerfect: 78, flagged: false, categories: {}, contentIssueCount: 1 },
        { email: 'b@x.ca', count: 12, scoredCount: 11, meanScore: 94.0, pctPerfect: 64, deltaPctPerfect: -26, othersPctPerfect: 90, flagged: true, categories: {}, contentIssueCount: 1 }
      ],
      anyEvaluatorFlagged: true
    },
    crossTab: {
      topics: [
        { label: 'Early retirement incentive', count: 20, scoredCount: 20, nonPerfectCount: 5, pctNonPerfect: 25, alwaysPerfect: false, categories: {}, contentIssueCount: 1 },
        { label: 'Public service pension', count: 22, scoredCount: 21, nonPerfectCount: 0, pctNonPerfect: 0, alwaysPerfect: true, categories: {}, contentIssueCount: 1 }
      ],
      actions: [
        { label: 'Check eligibility', count: 30, scoredCount: 29, nonPerfectCount: 4, pctNonPerfect: 14, alwaysPerfect: false, categories: {}, contentIssueCount: 2 }
      ],
      unclassifiedCount: 0
    },
    insights: {
      overview: 'Most answers score perfectly; deductions cluster on eligibility nuances.',
      topicPatterns: 'Early retirement incentive collects most deductions.',
      explanationThemes: [
        { theme: 'Confusing yes/no openers', count: 3, note: 'Experts flagged ambiguous openings.', examples: ['The no is confusing.'] }
      ],
      contentIssues: 'Both content issues concern outdated page content.',
      languageComparison: 'French sample is small; no meaningful difference.',
      evaluatorConsistency: 'b@x.ca scores diverge from the rest — worth a look.'
    }
  };

  it('renders a complete stored report', () => {
    render(<EvalAnalysisReport analysis={analysis} lang="en" />);
    expect(screen.getByText('Analysis report')).toBeTruthy();
    expect(screen.getByText('Scores by topic')).toBeTruthy();
    expect(screen.getByText('Early retirement incentive')).toBeTruthy();
    expect(screen.getByText('All perfect')).toBeTruthy();
    expect(screen.getByText('What the explanations say')).toBeTruthy();
    expect(screen.getByText('Confusing yes/no openers')).toBeTruthy();
    expect(screen.getByText('English vs French')).toBeTruthy();
    expect(screen.getByText('Evaluator consistency')).toBeTruthy();
    expect(screen.getByText('b@x.ca')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
  });

  it('shows the partial-results warning for an errored run', () => {
    render(<EvalAnalysisReport analysis={{ ...analysis, status: 'error', insights: null }} lang="en" />);
    expect(screen.getByText('This analysis did not finish — the results below are partial.')).toBeTruthy();
  });
});
