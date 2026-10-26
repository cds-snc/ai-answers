/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { buildEvalPillsHtml } from '../evalPills.js';

const t = (key) => ({
  'admin.chatDashboard.labels.evaluation.correct': 'correct',
  'admin.chatDashboard.labels.evaluation.needsImprovement': 'needs improvement',
  'admin.chatDashboard.labels.evaluation.harmful': 'harmful',
  'admin.chatDashboard.labels.evaluation.hasCitationError': 'citation issue',
  'admin.chatDashboard.labels.contentIssue': 'content issue',
}[key] || key);

const flags = (citation, content) => [
  { active: citation, className: 'hasCitationError', labelKey: 'admin.chatDashboard.labels.evaluation.hasCitationError' },
  { active: content, className: 'hasContentIssue', labelKey: 'admin.chatDashboard.labels.contentIssue' },
];

const render = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return Array.from(el.querySelectorAll('.label')).map((n) => [n.className, n.textContent]);
};

describe('buildEvalPillsHtml', () => {
  it('renders nothing for no value and no flags', () => {
    expect(buildEvalPillsHtml(t, null, flags(false, false))).toBe('');
  });

  it('stacks the base value with each active flag, in order', () => {
    expect(render(buildEvalPillsHtml(t, 'needsImprovement', flags(true, true)))).toEqual([
      ['label needsImprovement', 'needs improvement'],
      ['label hasCitationError', 'citation issue'],
      ['label hasContentIssue', 'content issue'],
    ]);
  });

  it('shows a flag pill on its own when there is no base value', () => {
    expect(render(buildEvalPillsHtml(t, '', flags(true, false)))).toEqual([
      ['label hasCitationError', 'citation issue'],
    ]);
  });

  it('harmful suppresses every other pill', () => {
    expect(render(buildEvalPillsHtml(t, 'harmful', flags(true, true)))).toEqual([
      ['label harmful', 'harmful'],
    ]);
  });

  it('falls back to the raw value when no label exists', () => {
    expect(render(buildEvalPillsHtml(t, 'mystery', []))).toEqual([
      ['label mystery', 'mystery'],
    ]);
  });
});
