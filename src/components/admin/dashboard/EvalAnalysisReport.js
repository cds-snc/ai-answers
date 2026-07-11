import React from 'react';
import { useTranslations } from '../../../hooks/useTranslations.js';
import { formatNumber, formatPercent, formatDecimal } from '../../../utils/numberFormat.js';

const cell = { borderBottom: '1px solid #e0e0e0', padding: '8px 8px' };
const head = { borderBottom: '2px solid #e0e0e0', padding: '8px 8px', textAlign: 'left' };
const numHead = { ...head, textAlign: 'right' };
const numCell = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' };

// Renders a stored eval-analysis report: computed tables (topics/actions
// cross-tab, EN/FR, evaluators) interleaved with the LLM narrative sections.
// Everything is read from the stored analysis doc — no fetching here.
const EvalAnalysisReport = ({ analysis, lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  const fmtScore = (n) => (typeof n === 'number' ? formatDecimal(n, lang, 1) : '—');
  const pctOrDash = (n) => (n !== null && n !== undefined ? fmtPct(n) : '—');

  if (!analysis) return null;
  const stats = analysis.stats || null;
  const crossTab = analysis.crossTab || null;
  const insights = analysis.insights || null;

  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

  const narrative = (text) => (text ? <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p> : null);

  const crossTabTable = (rows, labelColLabel) => (
    <div style={{ overflowX: 'auto' }}>
      <table className="display" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={head}>{labelColLabel}</th>
            <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colCount')}</th>
            <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colNonPerfect')}</th>
            <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colPctNonPerfect')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td style={cell}>
                {row.label}
                {row.alwaysPerfect && (
                  <span className="font-size-text-xsm-nr" style={{ marginLeft: 8, color: '#2e8540' }}>
                    {t('partnerDashboard.evalAnalysis.report.allPerfect')}
                  </span>
                )}
              </td>
              <td style={numCell}>{fmtN(row.count)}</td>
              <td style={numCell}>{fmtN(row.nonPerfectCount)}</td>
              <td style={numCell}>{pctOrDash(row.pctNonPerfect)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      {/* Header card: what was analyzed */}
      <div className="dashboard-card">
        <h3 className="card-title">{t('partnerDashboard.evalAnalysis.report.title')}</h3>
        <p className="font-size-text-xsm-nr">
          {t('partnerDashboard.evalAnalysis.report.header')
            .replace('{count}', fmtN(analysis.evalCount))
            .replace('{department}', analysis.department || '')
            .replace('{start}', fmtDate(analysis.startDate))
            .replace('{end}', fmtDate(analysis.endDate))}
          {' · '}
          {t('partnerDashboard.evalAnalysis.report.runOn').replace('{date}', fmtDate(analysis.createdAt))}
          {analysis.requestedBy ? ` · ${t('partnerDashboard.evalAnalysis.report.runBy').replace('{email}', analysis.requestedBy)}` : ''}
        </p>
        {(analysis.excludedCount > 0 || (crossTab && crossTab.unclassifiedCount > 0)) && (
          <p className="font-size-text-xsm-nr">
            {analysis.excludedCount > 0 &&
              t('partnerDashboard.evalAnalysis.report.excluded').replace('{count}', fmtN(analysis.excludedCount))}
            {analysis.excludedCount > 0 && crossTab && crossTab.unclassifiedCount > 0 && ' · '}
            {crossTab && crossTab.unclassifiedCount > 0 &&
              t('partnerDashboard.evalAnalysis.report.unclassified').replace('{count}', fmtN(crossTab.unclassifiedCount))}
          </p>
        )}
        {analysis.status === 'error' && (
          <div className="dashboard-warning">
            <span className="dashboard-warning__icon" aria-hidden="true" />
            {t('partnerDashboard.evalAnalysis.report.partial')}
          </div>
        )}
        {insights && narrative(insights.overview)}
      </div>

      {/* Scores by topic / action (Tier 2 cross-tab) */}
      {crossTab && (
        <div className="dashboard-card">
          <h3 className="card-title">{t('partnerDashboard.evalAnalysis.report.topicsTitle')}</h3>
          {crossTabTable(crossTab.topics || [], t('partnerDashboard.evalAnalysis.report.colTopic'))}
          <h3 className="card-title" style={{ marginTop: 24 }}>{t('partnerDashboard.evalAnalysis.report.actionsTitle')}</h3>
          {crossTabTable(crossTab.actions || [], t('partnerDashboard.evalAnalysis.report.colAction'))}
          {insights && narrative(insights.topicPatterns)}
        </div>
      )}

      {/* Explanation themes */}
      {insights && Array.isArray(insights.explanationThemes) && insights.explanationThemes.length > 0 && (
        <div className="dashboard-card">
          <h3 className="card-title">{t('partnerDashboard.evalAnalysis.report.themesTitle')}</h3>
          {insights.explanationThemes.map((theme, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <p style={{ marginBottom: 4 }}>
                <strong>{theme.theme}</strong>
                {typeof theme.count === 'number' && (
                  <span className="font-size-text-xsm-nr" style={{ marginLeft: 8 }}>
                    {t('partnerDashboard.evalAnalysis.report.themeCount').replace('{count}', fmtN(theme.count))}
                  </span>
                )}
              </p>
              {theme.note && <p className="font-size-text-xsm-nr" style={{ marginBottom: 4 }}>{theme.note}</p>}
              {Array.isArray(theme.examples) && theme.examples.length > 0 && (
                <ul className="font-size-text-xsm-nr" style={{ marginTop: 0 }}>
                  {theme.examples.map((ex, j) => (
                    <li key={j}><em>{ex}</em></li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Content issues */}
      {(insights?.contentIssues || (stats && stats.contentIssueCount > 0)) && (
        <div className="dashboard-card">
          <h3 className="card-title">{t('partnerDashboard.evalAnalysis.report.contentIssuesTitle')}</h3>
          {stats && (
            <p className="font-size-text-xsm-nr">
              {t('partnerDashboard.evalAnalysis.report.contentIssuesCount').replace('{count}', fmtN(stats.contentIssueCount))}
            </p>
          )}
          {insights && narrative(insights.contentIssues)}
        </div>
      )}

      {/* EN vs FR */}
      {stats && (
        <div className="dashboard-card">
          <h3 className="card-title">{t('partnerDashboard.evalAnalysis.report.languageTitle')}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="display" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={head}>{t('partnerDashboard.evalAnalysis.report.colLanguage')}</th>
                  <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colCount')}</th>
                  <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colMeanScore')}</th>
                  <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colPctPerfect')}</th>
                </tr>
              </thead>
              <tbody>
                {['en', 'fr'].map((key) => {
                  const row = stats.byLanguage?.[key];
                  if (!row) return null;
                  return (
                    <tr key={key}>
                      <td style={cell}>{t(`partnerDashboard.evalAnalysis.report.lang.${key}`)}</td>
                      <td style={numCell}>{fmtN(row.count)}</td>
                      <td style={numCell}>{fmtScore(row.meanScore)}</td>
                      <td style={numCell}>{pctOrDash(row.pctPerfect)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {insights && narrative(insights.languageComparison)}
        </div>
      )}

      {/* Evaluator consistency */}
      {stats && Array.isArray(stats.evaluators) && stats.evaluators.length > 0 && (
        <div className="dashboard-card">
          <h3 className="card-title">{t('partnerDashboard.evalAnalysis.report.evaluatorsTitle')}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="display" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={head}>{t('partnerDashboard.evalAnalysis.report.colEvaluator')}</th>
                  <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colCount')}</th>
                  <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colMeanScore')}</th>
                  <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colPctPerfect')}</th>
                  <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colDelta')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.evaluators.map((ev) => (
                  <tr key={ev.email}>
                    <td style={{ ...cell, wordBreak: 'break-all' }}>
                      {ev.email}
                      {ev.flagged && (
                        <span className="font-size-text-xsm-nr" style={{ marginLeft: 8, color: '#b10e1e' }}>
                          {t('partnerDashboard.evalAnalysis.report.flagged')}
                        </span>
                      )}
                    </td>
                    <td style={numCell}>{fmtN(ev.count)}</td>
                    <td style={numCell}>{fmtScore(ev.meanScore)}</td>
                    <td style={numCell}>{pctOrDash(ev.pctPerfect)}</td>
                    <td style={numCell}>
                      {ev.deltaPctPerfect !== null && ev.deltaPctPerfect !== undefined
                        ? `${ev.deltaPctPerfect > 0 ? '+' : ''}${fmtN(ev.deltaPctPerfect)}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {insights && narrative(insights.evaluatorConsistency)}
        </div>
      )}
    </div>
  );
};

export default EvalAnalysisReport;
