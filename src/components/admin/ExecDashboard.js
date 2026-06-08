import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useDashboardMetrics } from '../../hooks/admin/useDashboardMetrics.js';
import { buildFeedbackSplitData, buildFeedbackReasonsData } from '../../utils/dashboard/feedbackBreakdown.js';
import DashboardFilterBar from './DashboardFilterBar.js';
import StatCard from './dashboard/StatCard.js';
import KpiRow from './dashboard/KpiRow.js';
import DonutCard from './dashboard/DonutCard.js';
import HBarCard from './dashboard/HBarCard.js';
import DivergingBarCard from './dashboard/DivergingBarCard.js';
import { COLOURS } from '../../constants/dashboardColours.js';
import { BLOCK_QUERY_TYPES } from '../../constants/blockedQueryTypes.js';
import { formatNumber, formatPercent, formatDecimal } from '../../utils/numberFormat.js';

const ExecDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  const fmtSec = (ms) => formatDecimal((ms || 0) / 1000, lang, 1);
  const { metrics, loading, error, fetchMetrics } = useDashboardMetrics();

  // Track the applied department so the blocked-query table (which can't be
  // department-scoped — blocks happen before the department is known) is hidden
  // when a specific department is filtered.
  const [appliedDepartment, setAppliedDepartment] = useState('');
  const hasFetched = useRef(false);
  const handleApply = useCallback((filters) => {
    hasFetched.current = true;
    setAppliedDepartment(filters?.department || '');
    fetchMetrics(filters);
  }, [fetchMetrics]);

  // Separate, fixed last-12-months summary, independent of the filter below.
  // Fetched once on mount; the database only goes back to Oct 2025, which is
  // within the window, so the query simply returns everything since then.
  const { metrics: yearMetrics, loading: yearLoading, fetchMetrics: fetchYearMetrics } = useDashboardMetrics();
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    fetchYearMetrics({ startDate: start.toISOString(), endDate: end.toISOString() });
  }, [fetchYearMetrics]);

  // --- Last-12-months derived data ---

  // Row 1: questions, expert evaluated, partner count.
  const yearQuestions = yearMetrics.totalQuestions || 0;
  const yearExpertTotal = yearMetrics.expertScored?.total?.total || 0;
  const yearEvaluatedPct = yearExpertTotal > 0 && yearQuestions > 0 ? Math.round((yearExpertTotal / yearQuestions) * 100) : 0;
  // Partner count — departments with at least 1 expert evaluation.
  const yearPartnerCount = Object.values(yearMetrics.byDepartment || {})
    .filter(d => (d.expertScored?.total || 0) > 0).length;

  // Row 2 left: accuracy donut. Only "has answer error" counts against accuracy
  // (citation issues / needs-improvement do not); combines expert + AI evals.
  const yearAiTotal = yearMetrics.aiScored?.total?.total || 0;
  const yearEvalTotal = yearExpertTotal + yearAiTotal;
  const yearHasError = (yearMetrics.expertScored?.hasError?.total || 0) + (yearMetrics.aiScored?.hasError?.total || 0);
  const yearAccuracyPct = yearEvalTotal > 0 ? 100 - Math.round((yearHasError / yearEvalTotal) * 100) : null;
  const accuracyDonutData = yearEvalTotal > 0 ? [
    { name: t('execDashboard.charts.accurate'), value: yearEvalTotal - yearHasError },
    { name: t('execDashboard.charts.hasError'), value: yearHasError },
  ] : [];

  // Row 2 right: satisfaction breakdown bar. Positive rate (helpful / total) is
  // surfaced in the subtitle; feedback is classified by score (not the raw
  // yes/no click) so notWanted counts as helpful.
  const yearPfTotal = yearMetrics.publicFeedbackTotals?.totalQuestionsWithFeedback || 0;
  const yearFeedbackData = useMemo(
    () => buildFeedbackSplitData(yearMetrics.publicFeedbackTotals, yearMetrics.publicFeedbackReasons, t),
    [yearMetrics.publicFeedbackTotals, yearMetrics.publicFeedbackReasons, t],
  );
  const yearSatisfactionPct = yearPfTotal > 0 ? Math.round(((yearFeedbackData[0]?.value || 0) / yearPfTotal) * 100) : null;
  const yearFeedbackReasonsData = useMemo(
    () => buildFeedbackReasonsData(yearMetrics.publicFeedbackReasons, t),
    [yearMetrics.publicFeedbackReasons, t],
  );

  // --- Filtered-period derived data ---

  // Harmful (expert evaluations only). Shown in the Safety metrics row, even at 0.
  const harmful = metrics.expertScored?.harmful || {};

  // Blocked queries (safety counter). Total card + ranked bar breakdown by type.
  const blockedTotal = metrics.blockedQueries?.total || {};
  const blockedBarData = useMemo(() => {
    const bq = metrics.blockedQueries || {};
    return BLOCK_QUERY_TYPES
      .map((type) => {
        const row = bq[type] || {};
        return { name: t(`blockedQueries.types.${type}`), value: row.total || 0, en: row.en || 0, fr: row.fr || 0 };
      })
      .filter((d) => d.value > 0);
  }, [metrics.blockedQueries, t]);

  // Custom bar tooltip: total plus the EN/FR split for the hovered block type.
  const BlockedBarTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip__title">{row.name}</div>
        <div>{t('blockedQueries.colTotal')}: {fmtN(row.value)}</div>
        <div>{t('blockedQueries.colEn')}: {fmtN(row.en)} · {t('blockedQueries.colFr')}: {fmtN(row.fr)}</div>
      </div>
    );
  };

  const feedbackReasonsData = useMemo(() => buildFeedbackReasonsData(metrics.publicFeedbackReasons, t), [metrics.publicFeedbackReasons, t]);

  const departmentData = useMemo(() => {
    return Object.entries(metrics.byDepartment || {})
      .map(([dept, data]) => ({ name: dept, value: data.total || 0 }))
      .filter(d => d.value > 0 && d.name)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [metrics.byDepartment]);

  // Operations metrics. Median response time comes from the technical metrics
  // endpoint (milliseconds, shown in seconds); token totals come from usage.
  const responseTime = metrics.responseTime || {};
  const hasResponseTime = (responseTime.count || 0) > 0;

  return (
    <div>
      {/* Last 12 months summary — fixed window, independent of the filter below.
          Shows a loading state rather than zeroed cards while the (separate)
          year query is in flight. */}
      <h2 className="dashboard-section-title">
        {t('execDashboard.last12Months')}
      </h2>
      {yearLoading ? (
        <div className="dashboard-loading">
          {t('common.loading')}
        </div>
      ) : (
        <>
          {/* Row 1: questions asked, expert evaluated, partner institutions */}
          <div className="dashboard-row">
            <StatCard
              label={t('execDashboard.kpi.questionsAsked')}
              value={fmtN(yearQuestions)}
              sub={t('execDashboard.kpi.questionsSub')
                .replace('{en}', fmtN(yearMetrics.totalQuestionsEn))
                .replace('{fr}', fmtN(yearMetrics.totalQuestionsFr))}
            />
            <StatCard
              label={t('execDashboard.kpi.evaluated')}
              value={fmtN(yearExpertTotal)}
              sub={t('execDashboard.kpi.evaluatedSub').replace('{pct}', fmtPct(yearEvaluatedPct))}
            />
            <StatCard
              label={t('execDashboard.kpi.partnerCount')}
              value={fmtN(yearPartnerCount)}
            />
          </div>
          {/* Row 2: accuracy donut (left) + satisfaction breakdown bar (right) */}
          <div className="dashboard-row">
            <DonutCard
              title={t('execDashboard.charts.accuracyDonutTitle')}
              data={accuracyDonutData.length > 0 ? accuracyDonutData : [{ name: t('execDashboard.charts.noData'), value: 1 }]}
              colours={accuracyDonutData.length > 0 ? [COLOURS.correct, COLOURS.hasError] : [COLOURS.empty]}
              centreValue={yearAccuracyPct !== null ? fmtPct(yearAccuracyPct) : '—'}
              centreLabel={t('execDashboard.charts.accuracyCentre')}
              centreClass={yearAccuracyPct === null ? undefined : yearAccuracyPct >= 80 ? 'green' : yearAccuracyPct > 50 ? 'orange' : 'red'}
              lang={lang}
            />
            <div className="dashboard-chart-wide">
              <DivergingBarCard
                title={t('execDashboard.charts.feedbackBreakdownTitle')}
                subtitle={yearPfTotal > 0
                  ? t('execDashboard.charts.satisfactionBreakdownSubtitle')
                      .replace('{pct}', fmtPct(yearSatisfactionPct))
                      .replace('{total}', fmtN(yearPfTotal))
                  : undefined}
                data={yearFeedbackReasonsData}
                noDataLabel={t('execDashboard.charts.noData')}
                lang={lang}
              />
            </div>
          </div>
        </>
      )}

      <h2 className="dashboard-section-title">
        {t('execDashboard.filteredPeriod')}
      </h2>

      <DashboardFilterBar lang={lang} loading={loading} onInitialLoad={fetchMetrics} onApply={handleApply} />

      {error && (
        <div className="dashboard-error">
          {t('execDashboard.error')}
        </div>
      )}

      {hasFetched.current && !loading && metrics.totalQuestions === 0 && !error && (
        <div className="dashboard-warning">
          <span className="dashboard-warning__icon" aria-hidden="true" />
          {t('execDashboard.noData')}
        </div>
      )}

      {/* Headline KPI cards for the selected date range */}
      <KpiRow metrics={metrics} t={t} lang={lang} />

      {/* Satisfaction (helpful or not) breakdown — diverging: positives right
          (green), negatives left (red), with negatives grouped at the bottom. */}
      {feedbackReasonsData.length > 0 && (
        <div className="dashboard-section">
          <DivergingBarCard
            title={t('execDashboard.charts.feedbackBreakdownTitle')}
            data={feedbackReasonsData}
            lang={lang}
          />
        </div>
      )}

      {/* Top institutions by question volume (all institutions, not just partners) */}
      {departmentData.length > 0 && (
        <div className="dashboard-section">
          <HBarCard
            title={t('execDashboard.charts.departmentsTitle')}
            data={departmentData}
            colour={COLOURS.brand}
            lang={lang}
          />
        </div>
      )}

      {/* Operations metrics. Median response time is drawn from the technical
          metrics endpoint (ms, displayed in seconds); token totals come from
          the usage endpoint. */}
      <h2 className="dashboard-section-title">
        {t('execDashboard.ops.title')}
      </h2>
      <div className="dashboard-row">
        <StatCard
          label={t('execDashboard.ops.medianResponseTime')}
          value={hasResponseTime
            ? t('execDashboard.ops.responseTimeValue').replace('{n}', fmtSec(responseTime.median))
            : '—'}
          sub={hasResponseTime
            ? t('execDashboard.ops.responseTimeSub').replace('{p95}', fmtSec(responseTime.p95))
            : undefined}
        />
        <StatCard
          label={t('execDashboard.ops.inputTokens')}
          value={fmtN(metrics.totalInputTokens)}
          sub={t('execDashboard.ops.tokensSub')
            .replace('{en}', fmtN(metrics.totalInputTokensEn))
            .replace('{fr}', fmtN(metrics.totalInputTokensFr))}
        />
        <StatCard
          label={t('execDashboard.ops.outputTokens')}
          value={fmtN(metrics.totalOutputTokens)}
          sub={t('execDashboard.ops.tokensSub')
            .replace('{en}', fmtN(metrics.totalOutputTokensEn))
            .replace('{fr}', fmtN(metrics.totalOutputTokensFr))}
        />
      </div>

      {/* Safety metrics */}
      <h2 className="dashboard-section-title">
        {t('execDashboard.safety.title')}
      </h2>
      {/* Blocked queries — total card beside the by-type chart. Global safety
          counter, can't be department-scoped, so hidden when a department filter
          is applied. Harmful card stacks under the blocked total in the left column. */}
      {appliedDepartment ? (
        <>
          <p className="font-size-text-small mb-300">
            {t('blockedQueries.deptNote')}
          </p>
          <div className="dashboard-row">
            <div className="dashboard-col-third">
              <StatCard
                label={t('execDashboard.kpi.harmful')}
                value={fmtN(harmful.total)}
                sub={t('execDashboard.kpi.harmfulSub')
                  .replace('{en}', fmtN(harmful.en))
                  .replace('{fr}', fmtN(harmful.fr))}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="dashboard-row">
          <div className="dashboard-col-third">
            <StatCard
              label={t('blockedQueries.totalCardLabel')}
              value={fmtN(blockedTotal.total)}
              sub={t('blockedQueries.langSub')
                .replace('{en}', fmtN(blockedTotal.en))
                .replace('{fr}', fmtN(blockedTotal.fr))}
            />
            <div className="mt-200">
              <StatCard
                label={t('execDashboard.kpi.harmful')}
                value={fmtN(harmful.total)}
                sub={t('execDashboard.kpi.harmfulSub')
                  .replace('{en}', fmtN(harmful.en))
                  .replace('{fr}', fmtN(harmful.fr))}
              />
            </div>
          </div>
          <div className="dashboard-chart-wide">
            <HBarCard
              title={t('blockedQueries.byTypeTitle')}
              data={blockedBarData}
              height={Math.max(240, blockedBarData.length * 60)}
              lang={lang}
              tooltipContent={BlockedBarTooltip}
              noDataLabel={t('blockedQueries.noData')}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecDashboard;
