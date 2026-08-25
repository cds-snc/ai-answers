// Shared row/column builders for every "metric | count | % | EN count |
// EN % | FR count | FR %" DataTable on the Metrics dashboard —
// MetricsDashboard.js's Questions-by-position/Sessions/Question-types/
// expert-scored/AI-scored breakdown tables, and EndUserFeedbackSection.js's
// Totals table. Same row shape, same seven columns, previously duplicated
// verbatim six times — including the type:'num'/render fix below, which
// stops DataTables guessing each column's type (and thus its right-align
// class) from pre-formatted string content. See AGENTS.md's DataTables
// number-formatting rule.

/**
 * Builds one row of raw numbers (not pre-formatted strings — formatting
 * happens only in getCountPctColumns' render, at actual display time).
 *
 * `denom` is either:
 *  - a single number: every percentage (total/EN/FR) divides by the same
 *    denominator — Questions by position, Sessions, and Question types all
 *    divide every row by the page's totalQuestions/totalConversations.
 *  - a {total, en, fr} object: each language's percentage divides by that
 *    same language's own denominator, not the grand total — the expert/
 *    AI-scored breakdowns do this ("% of EN evaluations with this error",
 *    not "% of all evaluations that also happen to be EN").
 */
export function buildCountPctRow(metricLabel, counts, denom) {
  const d = (denom && typeof denom === 'object') ? denom : { total: denom, en: denom, fr: denom };
  return {
    metric: metricLabel,
    count: counts.total,
    percentage: d.total ? Math.round((counts.total / d.total) * 100) : 0,
    enCount: counts.en,
    enPercentage: d.en ? Math.round((counts.en / d.en) * 100) : 0,
    frCount: counts.fr,
    frPercentage: d.fr ? Math.round((counts.fr / d.fr) * 100) : 0
  };
}

/** Column defs matching buildCountPctRow's shape. `t`/`fmtN`/`fmtPct` are
 * passed in rather than imported, since each caller's are already bound to
 * its own `lang`. */
export function getCountPctColumns(t, fmtN, fmtPct) {
  const numCol = (data, titleKey) => ({
    title: t(titleKey),
    data,
    type: 'num',
    render: (d, type) => type === 'display' ? fmtN(d) : d
  });
  const pctCol = (data, titleKey) => ({
    title: t(titleKey),
    data,
    type: 'num',
    render: (d, type) => type === 'display' ? fmtPct(d) : d
  });
  return [
    { title: t('metrics.dashboard.metric'), data: 'metric' },
    numCol('count', 'metrics.dashboard.count'),
    pctCol('percentage', 'metrics.dashboard.percentage'),
    numCol('enCount', 'metrics.dashboard.enCount'),
    pctCol('enPercentage', 'metrics.dashboard.enPercentage'),
    numCol('frCount', 'metrics.dashboard.frCount'),
    pctCol('frPercentage', 'metrics.dashboard.frPercentage')
  ];
}
