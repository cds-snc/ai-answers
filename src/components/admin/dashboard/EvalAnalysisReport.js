import React from 'react';
import { useTranslations } from '../../../hooks/useTranslations.js';
import { formatNumber, formatPercent, formatDecimal } from '../../../utils/numberFormat.js';

const cell = { borderBottom: '1px solid #e0e0e0', padding: '8px 8px' };
const head = { borderBottom: '2px solid #e0e0e0', padding: '8px 8px', textAlign: 'left' };
const numHead = { ...head, textAlign: 'right' };
const numCell = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' };

// Renders a stored eval-analysis report: computed tables (programs/actions
// cross-tab, EN/FR, evaluators) interleaved with the LLM narrative sections.
// Everything is read from the stored analysis doc — no fetching here.
const EvalAnalysisReport = ({ analysis, lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  const fmtScore = (n) => (typeof n === 'number' ? formatDecimal(n, lang, 1) : '—');
  const pctOrDash = (n) => (n !== null && n !== undefined ? fmtPct(n) : '—');
  const noValue = t('partnerDashboard.evalAnalysis.report.noValue');

  if (!analysis) return null;
  const stats = analysis.stats || null;
  const crossTab = analysis.crossTab || null;
  const insights = analysis.insights || null;

  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

  const narrative = (text) => (text ? <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p> : null);

  const rowTable = Array.isArray(analysis.rows) && analysis.rows.length > 0 && (
    <div className="dashboard-section">
      <h3 className="dashboard-section-title">{t('partnerDashboard.evalAnalysis.report.rowsTitle')}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="display" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={head}>{t('partnerDashboard.evalAnalysis.report.colQuestion')}</th>
              <th style={head}>{t('partnerDashboard.evalAnalysis.report.colLanguage')}</th>
              <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colScore')}</th>
              <th style={head}>{t('partnerDashboard.evalAnalysis.report.colProgram')}</th>
              <th style={head}>{t('partnerDashboard.evalAnalysis.report.colAction')}</th>
              <th style={head}>{t('partnerDashboard.evalAnalysis.report.colEvaluator')}</th>
              <th style={head}>{t('partnerDashboard.evalAnalysis.report.colDetails')}</th>
            </tr>
          </thead>
          <tbody>
            {analysis.rows.map((row) => (
              <tr key={row.id}>
                <td style={{ ...cell, minWidth: 280 }}>{row.q || noValue}</td>
                <td style={cell}>{row.lang === 'fr' ? t('partnerDashboard.evalAnalysis.report.lang.fr') : t('partnerDashboard.evalAnalysis.report.lang.en')}</td>
                <td style={numCell}>{row.score === null || row.score === undefined ? noValue : fmtN(row.score)}</td>
                <td style={cell}>{row.program || noValue}</td>
                <td style={cell}>{row.action || noValue}</td>
                <td style={{ ...cell, wordBreak: 'break-all' }}>{row.evaluator || noValue}</td>
                <td style={cell}>
                  <details>
                    <summary style={{ cursor: 'pointer' }}>{t('partnerDashboard.evalAnalysis.report.viewRowData')}</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', maxWidth: 600 }}>{JSON.stringify(row, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Same review-mode deep link the eval/chat dashboards use for chatIds, in
  // the conversation's own language. Older stored reports have no example.
  const exampleLink = (example) => {
    if (!example?.chatId) return '—';
    const chatLang = example.lang === 'fr' ? 'fr' : 'en';
    const hash = example.interactionId ? `#interaction=${encodeURIComponent(`interactionId${example.interactionId}`)}` : '';
    return (
      <a
        href={`/${chatLang}?chat=${encodeURIComponent(example.chatId)}&review=1${hash}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {example.chatId}
      </a>
    );
  };

  const crossTabTable = (rows, labelColLabel) => (
    <div style={{ overflowX: 'auto' }}>
      <table className="display" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={head}>{labelColLabel}</th>
            <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colCount')}</th>
            <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colNonPerfect')}</th>
            <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colPctNonPerfect')}</th>
            <th style={head}>{t('partnerDashboard.evalAnalysis.report.colExample')}</th>
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
              <td style={{ ...cell, wordBreak: 'break-all' }} className="font-size-text-xsm-nr">
                {exampleLink(row.example)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      {analysis.status !== 'complete' && analysis.status !== 'error' && (
        <div className="dashboard-warning">
          <span className="dashboard-warning__icon" aria-hidden="true" />
          {t('partnerDashboard.evalAnalysis.report.running').replace('{status}', t(`partnerDashboard.evalAnalysis.status.${analysis.status}`))}
        </div>
      )}
      {/* Header: what was analyzed. Plain sections with dashboard-style
          headings — the card border/box chrome is reserved for the stat and
          chart cards elsewhere on the dashboard. */}
      <div className="dashboard-section">
        <h3 className="dashboard-section-title">{t('partnerDashboard.evalAnalysis.report.title')}</h3>
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
      </div>

      {/* Scores by combined program — action group (Tier 2 cross-tab) */}
      {crossTab && Array.isArray(crossTab.groups) && (
        <div className="dashboard-section">
          <h3 className="dashboard-section-title">{t('partnerDashboard.evalAnalysis.report.programActionsTitle')}</h3>
          {crossTabTable(crossTab.groups, t('partnerDashboard.evalAnalysis.report.colProgramAction'))}
          {crossTab.skippedSingles?.groupCount > 0 && (
            <p className="font-size-text-xsm-nr" style={{ marginTop: 8 }}>
              {t('partnerDashboard.evalAnalysis.report.singlesSkipped')
                .replace('{groups}', fmtN(crossTab.skippedSingles.groupCount))
                .replace('{count}', fmtN(crossTab.skippedSingles.rowCount))}
            </p>
          )}
        </div>
      )}

      {/* Explanation themes */}
      {insights && Array.isArray(insights.explanationThemes) && insights.explanationThemes.length > 0 && (
        <div className="dashboard-section">
          <h3 className="dashboard-section-title">{t('partnerDashboard.evalAnalysis.report.themesTitle')}</h3>
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

      {/* Content issues — only when some were flagged; no card for a zero count */}
      {stats && stats.contentIssueCount > 0 && (
        <div className="dashboard-section">
          <h3 className="dashboard-section-title">{t('partnerDashboard.evalAnalysis.report.contentIssuesTitle')}</h3>
          <p className="font-size-text-xsm-nr">
            {t('partnerDashboard.evalAnalysis.report.contentIssuesCount').replace('{count}', fmtN(stats.contentIssueCount))}
          </p>
          {insights && narrative(insights.contentIssues)}
        </div>
      )}

      {/* EN vs FR */}
      {stats && (
        <div className="dashboard-section">
          <h3 className="dashboard-section-title">{t('partnerDashboard.evalAnalysis.report.languageTitle')}</h3>
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
        </div>
      )}

      {/* Evaluators — no "vs others" column: the delta reads as a ranking of
          people, which is more sensitive than it is useful. A manager can
          derive divergence from the counts and rates shown. The Review flag
          (which uses the same delta internally) stays. */}
      {stats && Array.isArray(stats.evaluators) && stats.evaluators.length > 0 && (
        <div className="dashboard-section">
          <h3 className="dashboard-section-title">{t('partnerDashboard.evalAnalysis.report.evaluatorsTitle')}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="display" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={head}>{t('partnerDashboard.evalAnalysis.report.colEvaluator')}</th>
                  <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colCount')}</th>
                  <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colMeanScore')}</th>
                  <th style={numHead}>{t('partnerDashboard.evalAnalysis.report.colPctPerfect')}</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {rowTable}
    </div>
  );
};

export default EvalAnalysisReport;
