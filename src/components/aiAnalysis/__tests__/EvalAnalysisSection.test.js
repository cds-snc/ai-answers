/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForAnnouncement } from '../../../../test/liveAnnouncer.js';
import { getAnnouncedText, resetLiveAnnouncer } from '../../../utils/liveAnnouncer.js';

// EvalAnalysisReport's example-chatId link renders via <GcdsLink> (real
// custom element, shadow DOM) — jsdom doesn't expose its shadow-DOM anchor
// to getByRole('link'), so stub just that export as a plain <a>, same as
// ChatDashboardPage.test.js / UsedChatsPanel.test.js. GcdsButton becomes a
// plain <button> so `disabled` can be read, as in DeleteChatSection.test.js.
vi.mock('@gcds-core/components-react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    GcdsLink: ({ children, href, target }) => <a href={href} target={target}>{children}</a>,
    GcdsButton: ({ children, onClick, disabled }) => (
      <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
    )
  };
});

// The section talks to the eval-analysis endpoints through the client
// service; mock it so rendering needs no network.
vi.mock('../../../services/EvalAnalysisService.js', () => ({
  __esModule: true,
  default: {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockResolvedValue([])
  }
}));

// Real useEvalAnalysis() runs its own fetches off the mocked service above —
// overkill for a test that only needs one specific `analysis` shape rendered. Mocked here; individual
// tests override just the field(s) they care about by spreading this base.
const defaultHookResult = {
  running: false,
  analysis: null,
  runError: null,
  runAnalysis: vi.fn(),
  pastRuns: [],
  pastRunsDepartment: '',
  refreshList: vi.fn().mockResolvedValue(null),
  loadAnalysis: vi.fn(),
  clearAnalysis: vi.fn(),
  loadingAnalysisId: null,
  loadCount: 0
};
const mockUseEvalAnalysis = vi.fn(() => defaultHookResult);
vi.mock('../../../hooks/aiAnalysis/useEvalAnalysis.js', () => ({
  useEvalAnalysis: (...args) => mockUseEvalAnalysis(...args)
}));

import EvalAnalysisSection from '../EvalAnalysisSection.js';
import EvalAnalysisReport from '../EvalAnalysisReport.js';

afterEach(() => {
  cleanup();
});

describe('EvalAnalysisSection', () => {
  // GcdsButton can't carry aria-describedby into its shadow DOM, so the
  // reason Run is disabled or busy must come right before it in reading order.
  const precedes = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('says why Run is disabled right before the button, without a department', () => {
    render(<EvalAnalysisSection lang="en" appliedDepartment="" appliedFilters={null} />);
    const note = screen.getByText('Select an institution in the filters to run an analysis.');
    const button = screen.getByRole('button', { name: 'Run eval analysis' });
    expect(button.disabled).toBe(true);
    expect(precedes(note, button)).toBe(true);
  });

  it('puts the running message right before the Run button while a run is in progress', () => {
    mockUseEvalAnalysis.mockReturnValueOnce({ ...defaultHookResult, running: true });
    render(<EvalAnalysisSection lang="en" appliedDepartment="TBS-SCT" appliedFilters={{ department: 'TBS-SCT' }} />);
    const message = screen.getByText('Analyzing the evaluations. This can take a minute.');
    expect(precedes(message, screen.getByRole('button', { name: 'Run eval analysis' }))).toBe(true);
  });

  it('announces "Results loaded." when applying filters loads past runs', async () => {
    const refreshList = vi.fn().mockResolvedValue([{ _id: 'r1', status: 'complete' }]);
    mockUseEvalAnalysis.mockReturnValue({ ...defaultHookResult, refreshList });
    render(<EvalAnalysisSection lang="en" appliedDepartment="TBS-SCT" appliedFilters={{ department: 'TBS-SCT' }} />);
    expect(refreshList).toHaveBeenCalledWith('TBS-SCT');
    await waitForAnnouncement('Results loaded.', 'assertive');
    mockUseEvalAnalysis.mockImplementation(() => defaultHookResult);
  });

  it('says so, visibly and announced, when the institution has no past runs', async () => {
    mockUseEvalAnalysis.mockReturnValue({ ...defaultHookResult, pastRunsDepartment: 'TBS-SCT', pastRuns: [] });
    render(<EvalAnalysisSection lang="en" appliedDepartment="TBS-SCT" appliedFilters={{ department: 'TBS-SCT' }} />);
    expect(screen.getByText('No past analyses for this institution.')).toBeTruthy();
    await waitForAnnouncement('No past analyses for this institution.');
    mockUseEvalAnalysis.mockImplementation(() => defaultHookResult);
  });

  it('names the past-runs table and scopes its headers', () => {
    mockUseEvalAnalysis.mockReturnValueOnce({
      ...defaultHookResult,
      pastRunsDepartment: 'TBS-SCT',
      pastRuns: [{ _id: 'r1', status: 'complete', evalCount: 10, createdAt: '2026-11-01T00:00:00Z' }]
    });
    render(<EvalAnalysisSection lang="en" appliedDepartment="TBS-SCT" appliedFilters={{ department: 'TBS-SCT' }} />);
    const table = screen.getByRole('table', { name: 'Past analyses' });
    table.querySelectorAll('th').forEach((th) => expect(th.getAttribute('scope')).toBe('col'));
  });

  it('re-announces a still-running past run each time it is viewed', async () => {
    const props = { lang: 'en', appliedDepartment: 'TBS-SCT', appliedFilters: {} };
    const runningRun = { _id: 'a1', status: 'running', createdAt: new Date(Date.now() - 60 * 1000).toISOString() };
    const text = 'This analysis is still running. Check back in a few minutes.';
    mockUseEvalAnalysis.mockReturnValue({ ...defaultHookResult, analysis: runningRun, loadCount: 1 });
    const { rerender } = render(<EvalAnalysisSection {...props} />);
    await waitForAnnouncement(text);
    resetLiveAnnouncer();
    // Same run, same text: only the load count changed.
    mockUseEvalAnalysis.mockReturnValue({ ...defaultHookResult, analysis: { ...runningRun }, loadCount: 2 });
    rerender(<EvalAnalysisSection {...props} />);
    await waitForAnnouncement(text);
    mockUseEvalAnalysis.mockImplementation(() => defaultHookResult);
  });

  it('labels past runs that never finished, including v1 statuses, and recent ones as in progress', () => {
    mockUseEvalAnalysis.mockReturnValue({
      ...defaultHookResult,
      pastRuns: [
        { _id: 'r1', status: 'complete', evalCount: 10, createdAt: '2026-11-01T00:00:00Z' },
        { _id: 'r2', status: 'classifying', evalCount: 50, createdAt: '2026-10-01T00:00:00Z' },
        { _id: 'r3', status: 'running', evalCount: 0, createdAt: '2026-09-01T00:00:00Z' },
        { _id: 'r4', status: 'running', evalCount: 0, createdAt: new Date(Date.now() - 60 * 1000).toISOString() }
      ]
    });
    render(<EvalAnalysisSection lang="en" appliedDepartment="TBS-SCT" appliedFilters={{ department: 'TBS-SCT' }} />);
    expect(screen.getByText('Complete')).toBeTruthy();
    expect(screen.getAllByText('Did not finish')).toHaveLength(2);
    expect(screen.getByText('In progress')).toBeTruthy();
    mockUseEvalAnalysis.mockImplementation(() => defaultHookResult);
  });

  it('announces when a run finishes with a report', async () => {
    const props = { lang: 'en', appliedDepartment: 'TBS-SCT', appliedFilters: { department: 'TBS-SCT' } };
    mockUseEvalAnalysis.mockReturnValue({ ...defaultHookResult, running: true });
    const { rerender } = render(<EvalAnalysisSection {...props} />);
    mockUseEvalAnalysis.mockReturnValue({
      ...defaultHookResult,
      analysis: { _id: 'a1', status: 'complete', stats: null, insights: null, evalCount: 3 }
    });
    rerender(<EvalAnalysisSection {...props} />);
    await waitForAnnouncement('Results loaded.', 'assertive');
    mockUseEvalAnalysis.mockImplementation(() => defaultHookResult);
  });

  it('does not say "Results loaded." when the run failed with partial results', async () => {
    const props = { lang: 'en', appliedDepartment: 'TBS-SCT', appliedFilters: { department: 'TBS-SCT' } };
    mockUseEvalAnalysis.mockReturnValue({ ...defaultHookResult, running: true });
    const { rerender } = render(<EvalAnalysisSection {...props} />);
    mockUseEvalAnalysis.mockReturnValue({
      ...defaultHookResult,
      analysis: { _id: 'a1', status: 'error', stats: null, insights: null, evalCount: 3 }
    });
    rerender(<EvalAnalysisSection {...props} />);
    await waitForAnnouncement('This analysis did not finish', 'assertive');
    // Queued announcements are spoken 400 ms apart: wait past that gap so a
    // contradicting "Results loaded." would have landed.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(getAnnouncedText('assertive')).not.toContain('Results loaded.');
    mockUseEvalAnalysis.mockImplementation(() => defaultHookResult);
  });

  it('disables Run while a past report loads, so a late load cannot land mid-run', () => {
    mockUseEvalAnalysis.mockReturnValueOnce({ ...defaultHookResult, loadingAnalysisId: 'r1' });
    render(<EvalAnalysisSection lang="en" appliedDepartment="TBS-SCT" appliedFilters={{ department: 'TBS-SCT' }} />);
    expect(screen.getByRole('button', { name: 'Run eval analysis' }).disabled).toBe(true);
  });

  it('keeps the View button focusable while its report loads', () => {
    const loadAnalysis = vi.fn();
    mockUseEvalAnalysis.mockReturnValue({
      ...defaultHookResult,
      loadAnalysis,
      loadingAnalysisId: 'r1',
      pastRuns: [{ _id: 'r1', status: 'complete', evalCount: 10, createdAt: '2026-11-01T00:00:00Z' }]
    });
    render(<EvalAnalysisSection lang="en" appliedDepartment="TBS-SCT" appliedFilters={{ department: 'TBS-SCT' }} />);
    const button = screen.getByRole('button', { name: 'Loading...' });
    // Native disabled would drop focus to the top of the page.
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(loadAnalysis).not.toHaveBeenCalled();
    mockUseEvalAnalysis.mockImplementation(() => defaultHookResult);
  });

  it('says a recently started past run is still running, not interrupted', () => {
    mockUseEvalAnalysis.mockReturnValueOnce({
      ...defaultHookResult,
      analysis: { _id: 'a1', status: 'running', createdAt: new Date(Date.now() - 60 * 1000).toISOString() }
    });
    render(<EvalAnalysisSection lang="en" appliedDepartment="TBS-SCT" appliedFilters={{}} />);

    const message = screen.getByText('This analysis is still running. Check back in a few minutes.');
    expect(message.closest('.status-message--info-box')).toBeTruthy();
    expect(screen.queryByText(/interrupted before it finished/)).toBeNull();
  });

  it('shows the interrupted-run message as a warning, not info', () => {
    // A past run loaded in a non-terminal status (neither 'complete' nor
    // 'error') — the tab was closed mid-run, nothing left to display but
    // the fact that it needs re-running. That's warning-shaped (a broken
    // state with one way forward), not neutral info, even though role/
    // aria-live don't change between the two variants.
    mockUseEvalAnalysis.mockReturnValueOnce({ ...defaultHookResult, analysis: { _id: 'a1', status: 'running', createdAt: '2026-09-01T00:00:00Z' } });
    render(<EvalAnalysisSection lang="en" appliedDepartment="TBS-SCT" appliedFilters={{}} />);

    const message = screen.getByText('This analysis was interrupted before it finished and has no report to display. Run a new analysis.');
    expect(message.closest('.status-message--warning-box')).toBeTruthy();
    expect(message.closest('.status-message--info-box')).toBeNull();
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
      groups: [
        { label: 'Early retirement incentive — Check eligibility', count: 20, scoredCount: 20, nonPerfectCount: 5, pctNonPerfect: 25, alwaysPerfect: false, categories: {}, contentIssueCount: 1, example: { chatId: 'chat-abc', interactionId: 'int-1', lang: 'en' } },
        { label: 'Public service pension — Apply', count: 22, scoredCount: 21, nonPerfectCount: 0, pctNonPerfect: 0, alwaysPerfect: true, categories: {}, contentIssueCount: 1 }
      ],
      skippedSingles: { groupCount: 2, rowCount: 2 },
      unclassifiedCount: 0
    },
    insights: {
      explanationThemes: [
        { theme: 'Confusing yes/no openers', count: 3, note: 'Experts flagged ambiguous openings.', examples: ['The no is confusing.'] }
      ],
      contentIssues: 'Both content issues concern outdated page content.'
    }
  };

  it('still renders a stored v1 report, scores table included', () => {
    render(<EvalAnalysisReport analysis={analysis} lang="en" />);
    expect(screen.getByText('Analysis report')).toBeTruthy();
    expect(screen.getByText('Scores by service and action')).toBeTruthy();
    expect(screen.getByText('Early retirement incentive — Check eligibility')).toBeTruthy();
    expect(screen.getByText('All perfect')).toBeTruthy();
    expect(screen.getByText('2 groups with only one evaluation are not shown (2 evaluations).')).toBeTruthy();
    expect(screen.getByText('What the explanations say')).toBeTruthy();
    expect(screen.getByText('Confusing yes/no openers')).toBeTruthy();
    expect(screen.getByText('English vs French')).toBeTruthy();
    expect(screen.getByText('Evaluators')).toBeTruthy();
    expect(screen.getByText('b@x.ca')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    // "vs others" column removed deliberately (sensitivity); flag stays.
    expect(screen.queryByText('vs others')).toBeNull();
    // Example chatId links to review mode in a new tab, deep-linked to the
    // evaluated interaction, routed to the example's own (EN/FR breakdown
    // row) language - here 'en', same as the admin's own `lang`, which
    // still rides along separately as the adminLang query param; groups
    // without a stored example render a dash.
    const link = screen.getByRole('link', { name: 'chat-abc' });
    expect(link.getAttribute('href')).toBe('/en?chat=chat-abc&review=1&adminLang=en#interaction=interactionId' + encodeURIComponent('int-1'));
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('renders a v2 report without a scores table, and says when the model saw a subset', () => {
    const v2 = {
      ...analysis,
      crossTab: null,
      insightInput: { nonPerfectTotal: 200, nonPerfectSent: 150, contentIssueTotal: 2, contentIssueSent: 2 }
    };
    render(<EvalAnalysisReport analysis={v2} lang="en" />);
    expect(screen.queryByText('Scores by service and action')).toBeNull();
    expect(screen.getByText('The findings use 150 of 200 evaluations scored below perfect: errors first, then the most recent.')).toBeTruthy();
    expect(screen.queryByText(/^The content issue findings use/)).toBeNull();
    expect(screen.getByText('English vs French')).toBeTruthy();
    expect(screen.getByText('Evaluators')).toBeTruthy();
  });

  it('leaves out the subset note when the model saw every non-perfect evaluation', () => {
    const v2 = { ...analysis, crossTab: null, insightInput: { nonPerfectTotal: 6, nonPerfectSent: 6, contentIssueTotal: 0, contentIssueSent: 0 } };
    render(<EvalAnalysisReport analysis={v2} lang="en" />);
    expect(screen.queryByText(/^The findings use/)).toBeNull();
  });

  it('says when content issues were cut, even with no themes', () => {
    const v2 = {
      ...analysis,
      crossTab: null,
      insights: { explanationThemes: [], contentIssues: '' },
      insightInput: { nonPerfectTotal: 6, nonPerfectSent: 6, contentIssueTotal: 180, contentIssueSent: 150 }
    };
    render(<EvalAnalysisReport analysis={v2} lang="en" />);
    expect(screen.getByText('The content issue findings use 150 of 180 flagged evaluations: errors first, then the most recent.')).toBeTruthy();
  });

  it('hides the content-issues card when none were flagged', () => {
    const noIssues = { ...analysis, stats: { ...analysis.stats, contentIssueCount: 0 } };
    render(<EvalAnalysisReport analysis={noIssues} lang="en" />);
    expect(screen.queryByText('Content issues')).toBeNull();
  });

  it('shows the partial-results warning for an errored run', () => {
    render(<EvalAnalysisReport analysis={{ ...analysis, status: 'error', insights: null }} lang="en" />);
    expect(screen.getByText('This analysis did not finish — the results below are partial.')).toBeTruthy();
  });
});
