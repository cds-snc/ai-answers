import React, { useMemo, useEffect } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useDashboardMetrics } from '../../hooks/admin/useDashboardMetrics.js';
import { buildFeedbackSplitData, buildFeedbackReasonsData } from '../../utils/dashboard/feedbackBreakdown.js';
import DashboardFilterBar from './DashboardFilterBar.js';
import StatCard from './dashboard/StatCard.js';
import KpiRow from './dashboard/KpiRow.js';
import DonutCard from './dashboard/DonutCard.js';
import HBarCard from './dashboard/HBarCard.js';
import { COLOURS } from '../../constants/dashboardColours.js';
import { formatNumber, formatPercent, formatDecimal } from '../../utils/numberFormat.js';

const ExecDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  const fmtSec = (ms) => formatDecimal((ms || 0) / 1000, lang, 1);
  const { metrics, loading, error, fetchMetrics } = useDashboardMetrics();

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

  // --- Last-12-months derived data (partner count + user-satisfaction donut) ---

  // Partner count — departments with at least 1 expert evaluation.
  const yearPartnerCount = Object.values(yearMetrics.byDepartment || {})
    .filter(d => (d.expertScored?.total || 0) > 0).length;

  // User feedback split into helpful / not helpful, classified by score (not
  // the raw yes/no click) so notWanted counts as helpful.
  const yearPfTotal = yearMetrics.publicFeedbackTotals?.totalQuestionsWithFeedback || 0;
  const yearFeedbackData = useMemo(
    () => buildFeedbackSplitData(yearMetrics.publicFeedbackTotals, yearMetrics.publicFeedbackReasons, t),
    [yearMetrics.publicFeedbackTotals, yearMetrics.publicFeedbackReasons, t],
  );
  const yearSatisfactionPct = yearPfTotal > 0 ? Math.round(((yearFeedbackData[0]?.value || 0) / yearPfTotal) * 100) : null;

  // --- Filtered-period derived data ---

  // Harmful (expert evaluations only). Shown in the Safety metrics row, even at 0.
  const harmful = metrics.expertScored?.harmful || {};

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
    <div style={{ fontFamily: 'inherit' }}>
      {/* Last 12 months summary — fixed window, independent of the filter below.
          Shows a loading state rather than zeroed cards while the (separate)
          year query is in flight. */}
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: '#333' }}>
        {t('execDashboard.last12Months')}
      </h2>
      {yearLoading ? (
        <div style={{ color: '#888', textAlign: 'center', padding: '40px 0', fontSize: 14, marginBottom: 24 }}>
          {t('common.loading')}
        </div>
      ) : (
        <>
          <KpiRow metrics={yearMetrics} t={t} lang={lang} />
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            {/* Partner count card */}
            <div style={{
              flex: 1,
              minWidth: 180,
              background: '#fff',
              border: '1px solid #e0e0e0',
              borderRadius: 8,
              padding: '28px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
                {t('execDashboard.kpi.partnerCount')}
              </div>
              <div style={{ fontSize: 56, fontWeight: 700, color: COLOURS.brand, lineHeight: 1 }}>
                {fmtN(yearPartnerCount)}
              </div>
              <div style={{ fontSize: 13, color: '#555', marginTop: 10, lineHeight: 1.4 }}>
                {t('execDashboard.kpi.partnerCountSub')}
              </div>
            </div>
            <DonutCard
              title={t('execDashboard.charts.satisfactionTitle')}
              data={yearFeedbackData.length > 0 ? yearFeedbackData : [{ name: t('execDashboard.charts.noData'), value: 1 }]}
              colours={yearFeedbackData.length > 0 ? [COLOURS.feedbackPositive, COLOURS.feedbackNegative] : [COLOURS.empty]}
              centreValue={yearSatisfactionPct !== null ? fmtPct(yearSatisfactionPct) : '—'}
              centreLabel={t('execDashboard.charts.satisfactionCentre').replace('{total}', fmtN(yearPfTotal))}
              lang={lang}
            />
          </div>
        </>
      )}

      <DashboardFilterBar lang={lang} loading={loading} onApply={fetchMetrics} />

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: '#333' }}>
        {t('execDashboard.filteredPeriod')}
      </h2>

      {error && (
        <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 6, padding: '12px 16px', marginBottom: 24, color: '#c62828' }}>
          {t('execDashboard.error')}
        </div>
      )}

      {/* Headline KPI cards for the selected date range */}
      <KpiRow metrics={metrics} t={t} lang={lang} />

      {/* Satisfaction (helpful or not) breakdown — positives green, negatives red */}
      {feedbackReasonsData.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <HBarCard
            title={t('execDashboard.charts.feedbackBreakdownTitle')}
            data={feedbackReasonsData}
            lang={lang}
          />
        </div>
      )}

      {/* Top institutions by question volume (all institutions, not just partners) */}
      {departmentData.length > 0 && (
        <div style={{ marginBottom: 24 }}>
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
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: '#333' }}>
        {t('execDashboard.ops.title')}
      </h2>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
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
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: '#333' }}>
        {t('execDashboard.safety.title')}
      </h2>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard
          label={t('execDashboard.kpi.harmful')}
          value={fmtN(harmful.total)}
          sub={t('execDashboard.kpi.harmfulSub')
            .replace('{en}', fmtN(harmful.en))
            .replace('{fr}', fmtN(harmful.fr))}
        />
      </div>

      {!loading && metrics.totalQuestions === 0 && !error && (
        <p style={{ color: '#888', textAlign: 'center', padding: '40px 0' }}>
          {t('execDashboard.noData')}
        </p>
      )}
    </div>
  );
};

export default ExecDashboard;
