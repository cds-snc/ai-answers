import { describe, expect, it } from 'vitest';
import { evalAnalysisInsightsStrategy } from '../evalAnalysisInsightsStrategy.js';

// The prompt reads these payload fields by name. Dropping one fails nothing
// else — the model just stops seeing it (see AGENTS.md, "Never drop a prompt
// tag that code has to inject").
describe('evalAnalysisInsightsStrategy.buildMessages', () => {
  const request = {
    language: 'fr',
    department: 'CRA-ARC',
    dateRange: { start: '2026-10-01', end: '2026-10-31' },
    stats: { total: 3 },
    minThemeCount: 2,
    lowScoreRows: [{ q: 'q1', score: 90 }],
    contentIssueRows: [{ q: 'q2', score: 100 }]
  };

  it('sends every input the prompt refers to', () => {
    const [system, user] = evalAnalysisInsightsStrategy.buildMessages(request);
    expect(system.role).toBe('system');
    expect(system.content).toContain('min_theme_count');
    expect(JSON.parse(user.content)).toEqual({
      language: 'fr',
      department: 'CRA-ARC',
      date_range: { start: '2026-10-01', end: '2026-10-31' },
      stats: { total: 3 },
      min_theme_count: 2,
      non_perfect_evaluations: [{ q: 'q1', score: 90 }],
      content_issue_evaluations: [{ q: 'q2', score: 100 }]
    });
  });

  it('no longer sends or mentions a per-program cross-tab', () => {
    const [system, user] = evalAnalysisInsightsStrategy.buildMessages({ ...request, crossTab: { groups: [] } });
    expect(JSON.parse(user.content)).not.toHaveProperty('cross_tab');
    expect(system.content).not.toMatch(/cross-tab/i);
  });

  it('tells the model it may receive a subset of the explanations', () => {
    const [system] = evalAnalysisInsightsStrategy.buildMessages(request);
    expect(system.content).toContain('you receive a subset: errors first, then the most recent');
  });
});
