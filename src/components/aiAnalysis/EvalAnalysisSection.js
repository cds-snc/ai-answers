import React, { useEffect, useRef } from 'react';
import { GcdsButton } from '@gcds-core/components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useEvalAnalysis } from '../../hooks/aiAnalysis/useEvalAnalysis.js';
import { useResultsLoadedAnnouncement } from '../../hooks/admin/useResultsLoadedAnnouncement.js';
import { formatNumber } from '../../utils/numberFormat.js';
import { announce } from '../../utils/liveAnnouncer.js';
import EvalAnalysisReport from './EvalAnalysisReport.js';
import StatusMessage from '../admin/StatusMessage.js';

// How long a stored 'running' run counts as in progress rather than
// abandoned. Well past the server's 300-second request limit.
const IN_PROGRESS_WINDOW_MS = 10 * 60 * 1000;

// A run that isn't complete or failed is in progress if it started recently
// (someone else's run, or one whose request timed out while the server kept
// going). Older ones, and v1's 'classifying'/'synthesizing', never finished.
const isInProgress = (run) =>
  run.status === 'running' && Date.now() - new Date(run.createdAt).getTime() < IN_PROGRESS_WINDOW_MS;

// "Eval analysis" section of the AI-assisted analysis page.
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
    pastRunsDepartment,
    refreshList,
    loadAnalysis,
    clearAnalysis,
    loadingAnalysisId,
    loadCount
  } = useEvalAnalysis(lang);

  // Key the effect on the filters' VALUES, not the object identity — the
  // FilterPanel emits a fresh object on every Apply, so re-applying identical
  // filters must not clear the report or refetch the list.
  const filtersRef = useRef(appliedFilters);
  filtersRef.current = appliedFilters;
  const filtersKey = appliedFilters ? JSON.stringify(appliedFilters) : '';
  // Read through a ref so a new `t` doesn't re-run the effect (and refetch).
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    // Filters changed: drop any displayed report — it may belong to another
    // institution or date range — then refresh the past-runs list.
    clearAnalysis();
    if (!appliedDepartment || !filtersRef.current) return undefined;
    // This page fetches nothing else on Apply, so the list is the result a
    // screen reader user hears about: "Results loaded." when there are past
    // runs; the visible "no past analyses" message announces the empty case.
    let stale = false;
    refreshList(appliedDepartment).then((runs) => {
      if (!stale && runs && runs.length > 0) announce(tRef.current('admin.common.resultsLoaded'), { assertive: true });
    });
    return () => { stale = true; };
  }, [filtersKey, appliedDepartment, clearAnalysis, refreshList]);

  // Not while a past report is loading either: its response would land in
  // the report area during the new run.
  const loadingPastRun = Boolean(loadingAnalysisId);
  const canRun = Boolean(appliedDepartment) && !running && !loadingPastRun;

  // The report appears silently below, after a wait of up to a minute (a
  // run) or a fetch (a past run's View): say it arrived, like every other
  // dashboard. Only for a complete run: a failed run's partial report has
  // its own error message, and a past run that never finished (or is still
  // running) shows a message instead — each announces itself, and "Results
  // loaded." next to them would contradict them.
  const reportShown = Boolean(analysis) && (analysis.status === 'complete' || analysis.status === 'error');
  const loadedCount = analysis?.status === 'complete' ? null : 0;
  useResultsLoadedAnnouncement({ loading: running, count: loadedCount, error: runError, t });
  useResultsLoadedAnnouncement({ loading: loadingPastRun, count: loadedCount, error: runError, t });

  const statusLabel = (run) => {
    if (run.status === 'complete' || run.status === 'error') return t(`admin.aiAnalysis.evalAnalysis.status.${run.status}`);
    return t(`admin.aiAnalysis.evalAnalysis.status.${isInProgress(run) ? 'inProgress' : 'incomplete'}`);
  };

  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

  const cellStyle = { borderBottom: '1px solid #e0e0e0', padding: '8px 8px' };
  const headStyle = { borderBottom: '2px solid #e0e0e0', padding: '8px 8px', textAlign: 'left' };

  return (
    <div>
      <h2 className="dashboard-section-title">{t('admin.aiAnalysis.evalAnalysis.title')}</h2>
      <div className="dashboard-section">
        <p className="font-size-text-xsm-nr">{t('admin.aiAnalysis.evalAnalysis.description')}</p>

        {/* Why Run is disabled, or that it's busy, sits right before the
            button so it's read on the way to it. Not aria-describedby:
            GcdsButton copies aria-* into its shadow DOM once, at load, and an
            id there can't point at an element outside the shadow root. */}
        {!appliedDepartment && (
          <p className="font-size-text-small">{t('admin.aiAnalysis.selectInstitution')}</p>
        )}

        {running && (
          <StatusMessage
            loading
            className="font-size-text-small"
            message={t('admin.aiAnalysis.evalAnalysis.running')}
          />
        )}

        <GcdsButton
          onClick={() => runAnalysis(appliedFilters)}
          disabled={!canRun || undefined}
          className="hydrated"
        >
          {t('admin.aiAnalysis.evalAnalysis.runButton')}
        </GcdsButton>

        {runError && (
          <StatusMessage variant="error" message={t('admin.aiAnalysis.evalAnalysis.error')} />
        )}
      </div>

      {appliedDepartment && pastRunsDepartment === appliedDepartment && pastRuns.length === 0 && (
        <div className="dashboard-section">
          <StatusMessage variant="info" message={t('admin.aiAnalysis.evalAnalysis.pastRuns.none')} />
        </div>
      )}

      {/* Past analyses for this institution — the global details/summary
          styling provides the box; no extra card chrome. */}
      {appliedDepartment && pastRuns.length > 0 && (
        <div className="dashboard-section">
          <details>
            <summary style={{ cursor: 'pointer' }}>
              {t('admin.aiAnalysis.evalAnalysis.pastRuns.title')}
            </summary>
              <div style={{ overflowX: 'auto' }}>
                <table className="display" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <caption className="sr-only">{t('admin.aiAnalysis.evalAnalysis.pastRuns.title')}</caption>
                  <thead>
                    <tr>
                      <th scope="col" style={headStyle}>{t('admin.aiAnalysis.evalAnalysis.pastRuns.colDate')}</th>
                      <th scope="col" style={headStyle}>{t('admin.aiAnalysis.evalAnalysis.pastRuns.colRange')}</th>
                      <th scope="col" style={{ ...headStyle, textAlign: 'right' }}>{t('admin.aiAnalysis.evalAnalysis.pastRuns.colCount')}</th>
                      <th scope="col" style={headStyle}>{t('admin.aiAnalysis.evalAnalysis.pastRuns.colStatus')}</th>
                      <th scope="col" style={headStyle}>{t('admin.aiAnalysis.evalAnalysis.pastRuns.colBy')}</th>
                      <th scope="col" style={headStyle}><span className="sr-only">{t('admin.aiAnalysis.evalAnalysis.pastRuns.colActions')}</span></th>
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
                              : t('admin.aiAnalysis.evalAnalysis.pastRuns.view')}
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

      {/* A past run loaded in a non-terminal state has no report to show;
          say why instead of rendering nothing. One still running (same
          check as its "In progress" label) is info: wait and check back.
          One that never finished is a warning: a broken run with one way
          forward, re-running it. */}
      {analysis && !running && analysis.status !== 'complete' && analysis.status !== 'error' && (
        <div className="dashboard-section">
          {isInProgress(analysis) ? (
            <StatusMessage variant="info" nonce={loadCount} message={t('admin.aiAnalysis.evalAnalysis.report.inProgress')} />
          ) : (
            <StatusMessage variant="warning" nonce={loadCount} message={t('admin.aiAnalysis.evalAnalysis.report.incomplete')} />
          )}
        </div>
      )}
    </div>
  );
};

export default EvalAnalysisSection;
