import React, { useEffect, useRef } from 'react';
import { GcdsButton } from '@gcds-core/components-react';
import { useTranslations } from '../../../hooks/useTranslations.js';
import { useEvalAnalysis } from '../../../hooks/admin/useEvalAnalysis.js';
import { useResultsLoadedAnnouncement } from '../../../hooks/admin/useResultsLoadedAnnouncement.js';
import { formatNumber } from '../../../utils/numberFormat.js';
import EvalAnalysisReport from './EvalAnalysisReport.js';
import StatusMessage from '../StatusMessage.js';

// How long a stored 'running' run counts as in progress rather than
// abandoned. Well past the server's 300-second request limit.
const IN_PROGRESS_WINDOW_MS = 10 * 60 * 1000;

// "Run eval analysis" section at the bottom of the partner dashboard.
// Disabled until an institution filter is applied. A run is one request that
// returns the finished report (see useEvalAnalysis), and past runs for the
// institution can be re-displayed without re-running.
const EvalAnalysisSection = ({ lang = 'en', appliedDepartment = '', appliedFilters = null }) => {
  const { t } = useTranslations(lang);
  const fmtN = (n) => formatNumber(n, lang);
  const {
    running,
    analysis,
    runError,
    runAnalysis,
    pastRuns,
    refreshList,
    loadAnalysis,
    clearAnalysis,
    loadingAnalysisId
  } = useEvalAnalysis(lang);

  // Key the effect on the filters' VALUES, not the object identity — the
  // FilterPanel emits a fresh object on every Apply, so re-applying identical
  // filters must not clear the report or refetch the list.
  const filtersRef = useRef(appliedFilters);
  filtersRef.current = appliedFilters;
  const filtersKey = appliedFilters ? JSON.stringify(appliedFilters) : '';

  useEffect(() => {
    // Filters changed: drop any displayed report — it may belong to another
    // institution or date range — then refresh the past-runs list.
    clearAnalysis();
    if (appliedDepartment && filtersRef.current) {
      refreshList(appliedDepartment);
    }
  }, [filtersKey, appliedDepartment, clearAnalysis, refreshList]);

  const canRun = Boolean(appliedDepartment) && !running;

  // The report appears silently below, after a wait of up to a minute (a
  // run) or a fetch (a past run's View): say it arrived, like every other
  // dashboard. A failure has its own error message instead.
  // A past run that never finished shows a warning instead, which announces
  // itself.
  const loadingPastRun = Boolean(loadingAnalysisId);
  const reportShown = Boolean(analysis) && (analysis.status === 'complete' || analysis.status === 'error');
  const loadedCount = reportShown ? null : 0;
  useResultsLoadedAnnouncement({ loading: running, count: loadedCount, error: runError, t });
  useResultsLoadedAnnouncement({ loading: loadingPastRun, count: loadedCount, error: runError, t });

  // Ties the (possibly disabled) Run analysis button to the text explaining
  // why, so screen reader users hear the reason instead of just "dimmed".
  // GcdsButton doesn't use native `disabled`, so it stays focusable while
  // running and needs the description then too.
  const runButtonDescribedBy = !appliedDepartment
    ? 'eval-analysis-select-institution'
    : running
      ? 'eval-analysis-running'
      : undefined;

  // A run that isn't complete or failed is in progress if it started
  // recently (someone else's run, or one whose request timed out while the
  // server kept going). Older ones, and v1's 'classifying'/'synthesizing',
  // never finished.
  const statusLabel = (run) => {
    if (run.status === 'complete' || run.status === 'error') return t(`partnerDashboard.evalAnalysis.status.${run.status}`);
    const startedAt = new Date(run.createdAt).getTime();
    const recent = run.status === 'running' && Date.now() - startedAt < IN_PROGRESS_WINDOW_MS;
    return t(`partnerDashboard.evalAnalysis.status.${recent ? 'inProgress' : 'incomplete'}`);
  };

  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

  const cellStyle = { borderBottom: '1px solid #e0e0e0', padding: '8px 8px' };
  const headStyle = { borderBottom: '2px solid #e0e0e0', padding: '8px 8px', textAlign: 'left' };

  return (
    <div>
      <h2 className="dashboard-section-title">{t('partnerDashboard.evalAnalysis.title')}</h2>
      <div className="dashboard-section">
        <p className="font-size-text-xsm-nr">{t('partnerDashboard.evalAnalysis.description')}</p>

        {!appliedDepartment && (
          <p id="eval-analysis-select-institution" className="font-size-text-small">{t('partnerDashboard.evalAnalysis.selectInstitution')}</p>
        )}

        {running && (
          <StatusMessage
            loading
            id="eval-analysis-running"
            className="font-size-text-small"
            message={t('partnerDashboard.evalAnalysis.running')}
          />
        )}

        <GcdsButton
          onClick={() => runAnalysis(appliedFilters)}
          disabled={!canRun || undefined}
          aria-describedby={runButtonDescribedBy}
          className="hydrated"
        >
          {t('partnerDashboard.evalAnalysis.runButton')}
        </GcdsButton>

        {runError && (
          <StatusMessage variant="error" message={t('partnerDashboard.evalAnalysis.error')} />
        )}
      </div>

      {/* Past analyses for this institution — the global details/summary
          styling provides the box; no extra card chrome. */}
      {appliedDepartment && pastRuns.length > 0 && (
        <div className="dashboard-section">
          <details>
            <summary style={{ cursor: 'pointer' }}>
              {t('partnerDashboard.evalAnalysis.pastRuns.title')}
            </summary>
              <div style={{ overflowX: 'auto' }}>
                <table className="display" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={headStyle}>{t('partnerDashboard.evalAnalysis.pastRuns.colDate')}</th>
                      <th style={headStyle}>{t('partnerDashboard.evalAnalysis.pastRuns.colRange')}</th>
                      <th style={{ ...headStyle, textAlign: 'right' }}>{t('partnerDashboard.evalAnalysis.pastRuns.colCount')}</th>
                      <th style={headStyle}>{t('partnerDashboard.evalAnalysis.pastRuns.colStatus')}</th>
                      <th style={headStyle}>{t('partnerDashboard.evalAnalysis.pastRuns.colBy')}</th>
                      <th style={headStyle}><span className="sr-only">{t('partnerDashboard.evalAnalysis.pastRuns.colActions')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastRuns.map((run) => (
                      <tr key={run._id}>
                        <td style={cellStyle}>{fmtDate(run.createdAt)}</td>
                        <td style={cellStyle}>{`${fmtDate(run.startDate)} – ${fmtDate(run.endDate)}`}</td>
                        <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtN(run.evalCount)}</td>
                        <td style={cellStyle}>{statusLabel(run)}</td>
                        <td style={{ ...cellStyle, wordBreak: 'break-all' }}>{run.requestedBy || '—'}</td>
                        <td style={cellStyle}>
                          {/* aria-disabled, not native disabled: disabling
                              the button that has focus drops focus to the
                              top of the page. */}
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              if (running || loadingPastRun) return;
                              loadAnalysis(run._id);
                            }}
                            aria-disabled={running || loadingPastRun || undefined}
                            style={{ background: 'none', border: 'none', padding: 0, color: '#284162', textDecoration: 'underline', cursor: running || loadingPastRun ? 'not-allowed' : 'pointer' }}
                          >
                            {loadingAnalysisId === run._id
                              ? t('common.loading')
                              : t('partnerDashboard.evalAnalysis.pastRuns.view')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </details>
        </div>
      )}

      {/* Report (completed run, or partial results after an error) */}
      {reportShown && (
        <div className="dashboard-section">
          <EvalAnalysisReport analysis={analysis} lang={lang} />
        </div>
      )}

      {/* A past run loaded in a non-terminal state (interrupted mid-run —
          e.g. the tab was closed) has no report to show; say so instead of
          rendering nothing. variant="warning", not "info" — unlike the
          precheck messages above (an objective fact about the dataset the
          user can't act on), this represents a genuinely broken/failed run
          with only one way forward (re-run it), which is warning-shaped. */}
      {analysis && !running && analysis.status !== 'complete' && analysis.status !== 'error' && (
        <div className="dashboard-section">
          <StatusMessage variant="warning" message={t('partnerDashboard.evalAnalysis.report.incomplete')} />
        </div>
      )}
    </div>
  );
};

export default EvalAnalysisSection;
