import React, { useMemo, useState, useCallback, useRef } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useDashboardMetrics } from '../../hooks/admin/useDashboardMetrics.js';
import { buildFeedbackReasonsData } from '../../utils/dashboard/feedbackBreakdown.js';
import DashboardFilterBar from './DashboardFilterBar.js';
import StatCard from './dashboard/StatCard.js';
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

  const [appliedDepartment, setAppliedDepartment] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');
  const hasFetched = useRef(false);

  // The exec dashboard reports on public usage only: it excludes questions from
  // admin/partner accounts signed in to test and evaluate (userType 'public' =
  // no logged-in user, which already covers the referred-public subset). The
  // minimal filter bar has no userType selector, so this is fixed here.
  const fetchExecMetrics = useCallback((filters) => {
    fetchMetrics({ ...filters, userType: 'public' });
  }, [fetchMetrics]);

  const handleInitialLoad = useCallback((filters) => {
    hasFetched.current = true;
    setAppliedDepartment(filters?.department || '');
    setAppliedStartDate(filters?.startDate || '');
    setAppliedEndDate(filters?.endDate || '');
    fetchExecMetrics(filters);
  }, [fetchExecMetrics]);

  const handleApply = useCallback((filters) => {
    hasFetched.current = true;
    setAppliedDepartment(filters?.department || '');
    setAppliedStartDate(filters?.startDate || '');
    setAppliedEndDate(filters?.endDate || '');
    fetchExecMetrics(filters);
  }, [fetchExecMetrics]);

  const formatDateRange = (start, end) => {
    if (!start || !end) return '';
    const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
    const opts = { year: 'numeric', month: 'long', day: 'numeric' };
    const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    return `${parse(start).toLocaleDateString(locale, opts)} – ${parse(end).toLocaleDateString(locale, opts)}`;
  };

  // The actual first date with data in the DB — used to clamp the custom date
  // picker min so users can't select a date range with no data.
  // Cleared while loading so it doesn't carry over a stale value between fetches.
  const minDate = !loading && metrics.firstDataDate ? metrics.firstDataDate.split('T')[0] : undefined;

  // KPI derived data
  const totalQuestions = metrics.totalQuestions || 0;
  const expertTotal = metrics.expertScored?.total?.total || 0;
  const evaluatedPct = expertTotal > 0 && totalQuestions > 0 ? Math.round((expertTotal / totalQuestions) * 100) : 0;

  // Accuracy donut (expert + AI evals combined; hasError AND harmful count against accuracy —
  // they are mutually exclusive categories, so harmful must be added separately)
  const aiTotal = metrics.aiScored?.total?.total || 0;
  const evalTotal = expertTotal + aiTotal;
  const hasError = (metrics.expertScored?.hasError?.total || 0) + (metrics.aiScored?.hasError?.total || 0)
    + (metrics.expertScored?.harmful?.total || 0) + (metrics.aiScored?.harmful?.total || 0);
  const accuracyPct = evalTotal > 0 ? 100 - Math.round((hasError / evalTotal) * 100) : null;
  const accuracyDonutData = evalTotal > 0 ? [
    { name: t('execDashboard.charts.accurate'), value: evalTotal - hasError },
    { name: t('execDashboard.charts.hasError'), value: hasError },
  ] : [];

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
  const filteredPfTotal = metrics.publicFeedbackTotals?.totalQuestionsWithFeedback || 0;

  // Count of institutions with at least one question in the filtered period.
  const byDepartmentCount = Object.values(metrics.byDepartment || {})
    .filter(d => (d.total || 0) > 0).length;

  const departmentData = useMemo(() => {
    return Object.entries(metrics.byDepartment || {})
      .map(([dept, data]) => ({ name: dept, value: data.total || 0 }))
      .filter(d => d.value > 0 && d.name)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [metrics.byDepartment]);

  const responseTime = metrics.responseTime || {};
  const hasResponseTime = (responseTime.count || 0) > 0;

  const kpiCards = (
    <>
      <StatCard
        label={t('execDashboard.kpi.questionsAsked')}
        value={fmtN(totalQuestions)}
        sub={t('execDashboard.kpi.questionsSub')
          .replace('{en}', fmtN(metrics.totalQuestionsEn))
          .replace('{fr}', fmtN(metrics.totalQuestionsFr))}
      />
      <StatCard
        label={t('execDashboard.kpi.evaluated')}
        value={fmtN(expertTotal)}
        sub={t('execDashboard.kpi.evaluatedSub').replace('{pct}', fmtPct(evaluatedPct))}
      />
    </>
  );

  return (
    <div>
      <h2 className="dashboard-section-title">
        {t('execDashboard.overviewTitle')}
      </h2>

      <DashboardFilterBar lang={lang} loading={loading} onInitialLoad={handleInitialLoad} onApply={handleApply} minDate={minDate} />

      <h2 className="dashboard-section-title">
        {formatDateRange(appliedStartDate, appliedEndDate)}
      </h2>

      {loading ? (
        <div className="dashboard-loading">
          {t('common.loading')}
        </div>
      ) : (
      <>

      {error && (
        <div className="dashboard-error">
          {t('execDashboard.error')}
        </div>
      )}

      {hasFetched.current && metrics.totalQuestions === 0 && !error && (
        <div className="dashboard-warning">
          <span className="dashboard-warning__icon" aria-hidden="true" />
          {t('execDashboard.noData')}
        </div>
      )}

      {/* KPI row: accuracy donut on the left (~2/3 wide), stat cards stacked on the right.
          Falls back to a flat row when there are too few evals to show the donut. */}
      {evalTotal >= 10 ? (
        <div className="dashboard-row">
          <div className="dashboard-col-half">
            <DonutCard
              title={t('execDashboard.charts.accuracyDonutTitle')}
              data={accuracyDonutData.length > 0 ? accuracyDonutData : [{ name: t('execDashboard.charts.noData'), value: 1 }]}
              colours={accuracyDonutData.length > 0 ? [COLOURS.correct, COLOURS.hasError] : [COLOURS.empty]}
              centreValue={accuracyPct !== null ? fmtPct(accuracyPct) : '—'}
              centreLabel={t('execDashboard.charts.accuracyCentre')}
              centreClass={accuracyPct === null ? undefined : accuracyPct >= 80 ? 'green' : accuracyPct > 50 ? 'orange' : 'red'}
              lang={lang}
            />
          </div>
          <div className="dashboard-col-half dashboard-col--equal-height">
            {kpiCards}
          </div>
        </div>
      ) : (
        <div className="dashboard-row">
          {kpiCards}
        </div>
      )}

      {/* Satisfaction (helpful or not) breakdown — full width diverging bar */}
      {filteredPfTotal >= 10 && (
        <div className="dashboard-section">
          <DivergingBarCard
            title={t('execDashboard.charts.feedbackBreakdownTitle')}
            data={feedbackReasonsData}
            lang={lang}
          />
        </div>
      )}

      {/* Top institutions: institution count stat card left, bar chart right */}
      {departmentData.length > 0 && (
        <div className="dashboard-row">
          <div className="dashboard-col-third dashboard-col--equal-height">
            <StatCard
              label={t('execDashboard.kpi.partnerCount')}
              value={fmtN(byDepartmentCount)}
            />
          </div>
          <div className="dashboard-chart-wide">
            <HBarCard
              title={t('execDashboard.charts.departmentsTitle')}
              data={departmentData}
              colour={COLOURS.brand}
              lang={lang}
              yAxisWidth={240}
              yAxisTextAlign="right"
              marginLeft={32}
            />
          </div>
        </div>
      )}

      {/* Operations metrics */}
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
          className="stat-card--wide"
          label={t('execDashboard.ops.inputTokens')}
          value={fmtN(metrics.totalInputTokens)}
          sub={t('execDashboard.ops.tokensSub')
            .replace('{en}', fmtN(metrics.totalInputTokensEn))
            .replace('{fr}', fmtN(metrics.totalInputTokensFr))}
        />
        <StatCard
          className="stat-card--wide"
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
      {/* Blocked queries — global safety counter, can't be department-scoped,
          so hidden when a department filter is applied.
          Layout: left column has blocked total + harmful stacked; chart fills the right. */}
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
          <div className="dashboard-col-third dashboard-col--equal-height">
            <StatCard
              label={t('blockedQueries.totalCardLabel')}
              value={fmtN(blockedTotal.total)}
              sub={t('blockedQueries.langSub')
                .replace('{en}', fmtN(blockedTotal.en))
                .replace('{fr}', fmtN(blockedTotal.fr))}
            />
            <StatCard
              label={t('execDashboard.kpi.harmful')}
              value={fmtN(harmful.total)}
              sub={t('execDashboard.kpi.harmfulSub')
                .replace('{en}', fmtN(harmful.en))
                .replace('{fr}', fmtN(harmful.fr))}
            />
          </div>
          <div className="dashboard-chart-wide">
            <HBarCard
              title={t('blockedQueries.byTypeTitle')}
              data={blockedBarData}
              height={Math.max(240, blockedBarData.length * 60)}
              lang={lang}
              yAxisWidth={220}
              tooltipContent={BlockedBarTooltip}
              noDataLabel={t('blockedQueries.noData')}
            />
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};

export default ExecDashboard;
