import React, { useId } from 'react';
import { useTranslations } from '../../../hooks/useTranslations.js';
import { formatNumber, formatPercent, formatDecimal, isSingular } from '../../../utils/numberFormat.js';

// Most actions a row lists before "and N more".
export const MAX_ACTIONS_SHOWN = 3;

// Which actions a row names. `actions` arrive most-asked first. Actions asked
// only once are noise in a busy service, so they're skipped — unless nothing
// else is left, in which case the top one is shown so the cell never claims
// there are no actions. Everything not shown is counted in `hiddenCount`.
export function pickActions(actions = []) {
  const repeated = actions.filter((a) => a.count > 1).slice(0, MAX_ACTIONS_SHOWN);
  const shown = repeated.length > 0 ? repeated : actions.slice(0, 1);
  return { shown, hiddenCount: actions.length - shown.length };
}

// Evaluation coverage by service (program) for the partner dashboard: how many
// questions each service gets, how many have a human expert evaluation, how
// many of those evaluations eval-informed answering can still use, and how
// many answers used past evaluations. Data: metrics.evalCoverage
// (api/metrics/metrics-eval-coverage.js).
//
// Accessibility:
// - Real <table> with a caption, column headers (scope="col") and the service
//   name as each row's header (scope="row"), so a screen reader announces
//   "GST/HST, Questions, 120" when moving across a row.
// - The table scrolls inside its own region on narrow screens. The region is
//   focusable and named by the caption, so keyboard users can scroll it and
//   screen-reader users hear what it is.
// - Empty values show an em dash visually and a spoken equivalent.
// - On the French dashboard, a service or action with no curated French name
//   falls back to English and is tagged lang="en" (WCAG 3.1.2).
// - The column definitions are visible text below the table, not tooltips.

const EvalCoverageCard = ({ coverage, lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const captionId = useId();
  const rows = coverage?.programs || [];
  if (rows.length === 0) return null;

  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  const k = (key) => t(`partnerDashboard.evalCoverage.${key}`);

  const localized = (en, fr) => {
    if (lang !== 'fr') return en;
    return fr || <span lang="en">{en}</span>;
  };

  const notApplicable = (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{k('notApplicable')}</span>
    </>
  );

  const renderActions = (actions) => {
    if (!actions.length) {
      return (
        <>
          <span aria-hidden="true">—</span>
          <span className="sr-only">{k('noActions')}</span>
        </>
      );
    }
    const { shown, hiddenCount } = pickActions(actions);
    return (
      <>
        {shown.map((a, i) => (
          <React.Fragment key={a.action}>
            {i > 0 && ', '}
            {localized(a.action, a.actionFr)}
          </React.Fragment>
        ))}
        {hiddenCount > 0 && (
          <>
            {' '}
            {t(isSingular(hiddenCount, lang) ? 'partnerDashboard.evalCoverage.moreActions.one' : 'partnerDashboard.evalCoverage.moreActions.other')
              .replace('{count}', () => fmtN(hiddenCount))}
          </>
        )}
      </>
    );
  };

  const title = k('title');

  return (
    <div className="dashboard-card">
      <h3 className="card-title card-title--has-subtitle">{title}</h3>
      <p className="card-subtitle font-size-text-xsm-nr">{k('subtitle')}</p>
      <div className="dashboard-table-scroll" role="region" aria-labelledby={captionId} tabIndex={0}>
        <table className="dashboard-data-table">
          <caption id={captionId} className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">{t('admin.common.columns.program')}</th>
              <th scope="col" className="dashboard-data-table__list">{k('colActions')}</th>
              <th scope="col" className="dashboard-data-table__num">{k('colQuestions')}</th>
              <th scope="col" className="dashboard-data-table__num">{k('colEvaluations')}</th>
              <th scope="col" className="dashboard-data-table__num">{k('colCoverage')}</th>
              <th scope="col" className="dashboard-data-table__num">{k('colUsable')}</th>
              <th scope="col" className="dashboard-data-table__num">{k('colExpiring')}</th>
              <th scope="col" className="dashboard-data-table__num">{k('colInformed')}</th>
              <th scope="col" className="dashboard-data-table__num">{k('colBelowPerfect')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const coveragePct = row.questions > 0 ? (row.humanEvals / row.questions) * 100 : null;
              const belowPerfectPct = row.scoredEvals > 0 ? Math.round((row.nonPerfectEvals / row.scoredEvals) * 100) : null;
              return (
                <tr key={row.program}>
                  <th scope="row">
                    {row.program === 'unknown' ? k('unclassified') : localized(row.program, row.programFr)}
                  </th>
                  <td>{renderActions(row.actions || [])}</td>
                  <td className="dashboard-data-table__num">{fmtN(row.questions)}</td>
                  <td className="dashboard-data-table__num">{fmtN(row.humanEvals)}</td>
                  <td className="dashboard-data-table__num">
                    {coveragePct === null ? notApplicable : fmtPct(formatDecimal(coveragePct, lang, 1))}
                  </td>
                  {/* null for the unclassified row: its evaluations can't be
                      traced to a service. */}
                  <td className="dashboard-data-table__num">{row.usableEvals == null ? notApplicable : fmtN(row.usableEvals)}</td>
                  <td className="dashboard-data-table__num">{row.expiringEvals == null ? notApplicable : fmtN(row.expiringEvals)}</td>
                  <td className="dashboard-data-table__num">{fmtN(row.informedAnswers)}</td>
                  <td className="dashboard-data-table__num">
                    {belowPerfectPct === null ? notApplicable : fmtPct(belowPerfectPct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Term/definition pairs, so a <dl>: the term is the column header. */}
      <dl className="dashboard-table-notes font-size-text-xsm-nr">
        <dt>{k('colCoverage')}</dt>
        <dd>{k('noteCoverage')}</dd>
        <dt>{k('colUsable')}</dt>
        <dd>{k('noteUsable').replace('{days}', () => fmtN(coverage.recencyDays))}</dd>
        <dt>{k('colExpiring')}</dt>
        <dd>{k('noteExpiring').replace('{days}', () => fmtN(coverage.expiringWindowDays))}</dd>
        <dt>{k('colInformed')}</dt>
        <dd>{k('noteInformed')}</dd>
        <dt>{k('colBelowPerfect')}</dt>
        <dd>{k('noteBelowPerfect')}</dd>
      </dl>
    </div>
  );
};

export default EvalCoverageCard;
