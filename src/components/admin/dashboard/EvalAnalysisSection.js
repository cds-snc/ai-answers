import React, { useEffect, useRef, useState } from 'react';
import { GcdsButton } from '@gcds-core/components-react';
import { useTranslations } from '../../../hooks/useTranslations.js';
import { useEvalAnalysis } from '../../../hooks/admin/useEvalAnalysis.js';
import { formatNumber } from '../../../utils/numberFormat.js';
import EvalAnalysisReport from './EvalAnalysisReport.js';
import EvalAnalysisService from '../../../services/EvalAnalysisService.js';
import StatusMessage from '../StatusMessage.js';

// "Run eval analysis" section at the bottom of the partner dashboard.
// Disabled until an institution filter is applied; the precheck endpoint
// supplies the volume gates (too few / too many evals) before a run is
// allowed. Runs are driven client-side step by step (see useEvalAnalysis),
// and past runs for the institution can be re-displayed without re-running.
const EvalAnalysisSection = ({ lang = 'en', appliedDepartment = '', appliedFilters = null }) => {
  const { t } = useTranslations(lang);
  const fmtN = (n) => formatNumber(n, lang);
  const [showResults, setShowResults] = useState(false);
  const {
    precheck,
    precheckLoading,
    runPrecheck,
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
  // filters must not refire the precheck aggregation. The ref carries the
  // latest object for the effect body without widening the dep array.
  const filtersRef = useRef(appliedFilters);
  filtersRef.current = appliedFilters;
  const filtersKey = appliedFilters ? JSON.stringify(appliedFilters) : '';

  useEffect(() => {
    // Filters changed: drop any displayed report — it may belong to another
    // institution or date range — then re-run the volume precheck.
    clearAnalysis();
    if (appliedDepartment && filtersRef.current) {
      runPrecheck(filtersRef.current);
      refreshList(appliedDepartment);
    }
  }, [filtersKey, appliedDepartment, clearAnalysis, runPrecheck, refreshList]);

  const count = precheck?.count ?? null;
  const tooFew = count !== null && count < (precheck?.min ?? 0);
  const tooMany = count !== null && count > (precheck?.max ?? Infinity);
  const canRun = Boolean(appliedDepartment) && !running && !precheckLoading && count !== null && !tooFew && !tooMany;

  // Ties the (possibly disabled) Run analysis button to whichever
  // explanatory text is currently showing above it, so screen reader users
  // hear *why* it's disabled instead of just "dimmed". Mirrors the same
  // condition order as the JSX below — only one of these is ever rendered
  // at a time. `running` and `precheckLoading` each need their own id here
  // too: they're async gaps where the button is aria-disabled (GcdsButton
  // doesn't use native `disabled`, so it stays focusable) but no
  // explanatory text was previously mounted.
  const runButtonDescribedBy = !appliedDepartment
    ? 'eval-analysis-select-institution'
    : running
      ? 'eval-analysis-running'
      : precheckLoading
        ? 'eval-analysis-checking'
        : tooFew
          ? 'eval-analysis-too-few'
          : tooMany
            ? 'eval-analysis-too-many'
            : (count !== null ? 'eval-analysis-precheck-count' : undefined);

  const progressLabel = () => {
    if (!analysis) return t('partnerDashboard.evalAnalysis.running.preparing');
    if (analysis.status === 'classifying') {
      return t('partnerDashboard.evalAnalysis.running.classifying')
        .replace('{done}', fmtN(analysis.progress?.classified ?? 0))
        .replace('{total}', fmtN(analysis.progress?.total ?? 0));
    }
    if (analysis.status === 'synthesizing') return t('partnerDashboard.evalAnalysis.running.synthesizing');
    return t('partnerDashboard.evalAnalysis.running.preparing');
  };

  const runErrorLabel = () => {
    if (!runError) return null;
    if (runError.code === 'tooFew') {
      return t('partnerDashboard.evalAnalysis.tooFew')
        .replace('{min}', fmtN(precheck?.min ?? 0))
        .replace('{count}', fmtN(runError.count ?? 0));
    }
    if (runError.code === 'tooMany') {
      return t('partnerDashboard.evalAnalysis.tooMany')
        .replace('{max}', fmtN(precheck?.max ?? 0))
        .replace('{count}', fmtN(runError.count ?? 0));
    }
    return t('partnerDashboard.evalAnalysis.error');
  };

  const loadFullAnalysis = async () => {
    if (!analysis?._id) return;
    try {
      setShowResults(true);
      // The running state is updated by the driver; this loads the complete
      // current snapshot for viewing/export without advancing the run.
      await loadAnalysis(analysis._id, { includeRows: true });
    } catch (e) {
      console.error('Failed to load current eval analysis:', e);
    }
  };

  const exportAnalysis = async () => {
    if (!analysis?._id) return;
    try {
      const full = await EvalAnalysisService.get(analysis._id, { includeRows: true });
      const blob = new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `eval-analysis-${analysis._id}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export current eval analysis:', e);
    }
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

        {appliedDepartment && precheckLoading && (
          <StatusMessage
            loading
            id="eval-analysis-checking"
            className="font-size-text-small"
            message={t('partnerDashboard.evalAnalysis.checkingEligibility')}
          />
        )}

        {appliedDepartment && !precheckLoading && count !== null && !running && (
          <>
            {tooFew && (
              <StatusMessage
                id="eval-analysis-too-few"
                variant="info"
                message={t('partnerDashboard.evalAnalysis.tooFew')
                  .replace('{min}', fmtN(precheck.min))
                  .replace('{count}', fmtN(count))}
              />
            )}
            {tooMany && (
              <StatusMessage
                id="eval-analysis-too-many"
                variant="info"
                message={t('partnerDashboard.evalAnalysis.tooMany')
                  .replace('{max}', fmtN(precheck.max))
                  .replace('{count}', fmtN(count))}
              />
            )}
            {!tooFew && !tooMany && (
              <p id="eval-analysis-precheck-count" className="font-size-text-small">
                {t('partnerDashboard.evalAnalysis.precheckCount').replace('{count}', fmtN(count))}
              </p>
            )}
          </>
        )}

        {running && (
          <StatusMessage
            loading
            id="eval-analysis-running"
            className="font-size-text-small"
            message={progressLabel()}
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

        {analysis && analysis.status !== 'complete' && analysis.status !== 'error' && (
          <div style={{ marginTop: 12 }}>
            <GcdsButton onClick={loadFullAnalysis} className="hydrated">
              {t('partnerDashboard.evalAnalysis.viewRunning')}
            </GcdsButton>
            <GcdsButton onClick={exportAnalysis} className="hydrated">
              {t('partnerDashboard.evalAnalysis.exportRunning')}
            </GcdsButton>
          </div>
        )}

        {runError && (
          <StatusMessage variant="error" message={runErrorLabel()} />
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
                        <td style={cellStyle}>{t(`partnerDashboard.evalAnalysis.status.${run.status}`)}</td>
                        <td style={{ ...cellStyle, wordBreak: 'break-all' }}>{run.requestedBy || '—'}</td>
                        <td style={cellStyle}>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => loadAnalysis(run._id)}
                            disabled={running || loadingAnalysisId === run._id}
                            style={{ background: 'none', border: 'none', padding: 0, color: '#284162', textDecoration: 'underline', cursor: 'pointer' }}
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
      {analysis && (showResults || analysis.status === 'complete' || analysis.status === 'error') && (
        <div className="dashboard-section">
          <EvalAnalysisReport analysis={analysis} lang={lang} />
        </div>
      )}

      {/* A past run loaded in a non-terminal state (interrupted mid-run —
          e.g. the tab was closed) has no report to show; say so instead of
          rendering nothing. */}
      {analysis && !running && analysis.status !== 'complete' && analysis.status !== 'error' && (
        <div className="dashboard-section">
          <StatusMessage variant="info" message={t('partnerDashboard.evalAnalysis.report.incomplete')} />
        </div>
      )}
    </div>
  );
};

export default EvalAnalysisSection;
