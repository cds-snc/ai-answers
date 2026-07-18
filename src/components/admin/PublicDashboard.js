import React, { useMemo, useState, useCallback, useRef } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useDashboardMetrics } from '../../hooks/admin/useDashboardMetrics.js';
import { buildFeedbackSplitData, buildFeedbackReasonsData } from '../../utils/dashboard/feedbackBreakdown.js';
import DashboardFilterBar from './DashboardFilterBar.js';
import StatCard from './dashboard/StatCard.js';
import DonutCard from './dashboard/DonutCard.js';
import HBarCard from './dashboard/HBarCard.js';
import DivergingBarCard from './dashboard/DivergingBarCard.js';
import NoDataCard from './dashboard/NoDataCard.js';
import { COLOURS } from '../../constants/dashboardColours.js';
import { buildBlockedBarData } from '../../utils/dashboard/blockedQueryBars.js';
import { formatNumber, formatPercent, formatDecimal } from '../../utils/numberFormat.js';

const PublicDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  const fmtSec = (ms) => formatDecimal((ms || 0) / 1000, lang, 1);
  const { metrics, loading, error, fetchMetrics } = useDashboardMetrics();

  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');
  const hasFetched = useRef(false);

  // The public dashboard reports on public usage only: it excludes questions from
  // admin/partner accounts signed in to test and evaluate (userType 'public' =
  // no logged-in user, which already covers the referred-public subset). The
  // minimal filter bar has no userType selector, so this is fixed here.
  const fetchPublicMetrics = useCallback((filters) => {
    fetchMetrics({ ...filters, userType: 'public' });
  }, [fetchMetrics]);

  const handleInitialLoad = useCallback((filters) => {
    hasFetched.current = true;
    setAppliedStartDate(filters?.startDate || '');
    setAppliedEndDate(filters?.endDate || '');
    fetchPublicMetrics(filters);
  }, [fetchPublicMetrics]);

  const handleApply = useCallback((filters) => {
    hasFetched.current = true;
    setAppliedStartDate(filters?.startDate || '');
    setAppliedEndDate(filters?.endDate || '');
    fetchPublicMetrics(filters);
  }, [fetchPublicMetrics]);

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

  // Accuracy donut (expert + AI evals combined; only hasError counts against accuracy)
  const aiTotal = metrics.aiScored?.total?.total || 0;
  const evalTotal = expertTotal + aiTotal;
  const hasError = (metrics.expertScored?.hasError?.total || 0) + (metrics.aiScored?.hasError?.total || 0);
  const accuracyPct = evalTotal > 0 ? 100 - Math.round((hasError / evalTotal) * 100) : null;
  const accuracyDonutData = evalTotal > 0 ? [
    { name: t('publicDashboard.charts.accurate'), value: evalTotal - hasError },
    { name: t('publicDashboard.charts.hasError'), value: hasError },
  ] : [];

  // EN/FR accuracy breakdown (expert + AI per language), shown as the donut
  // footer only when each language has more than 10 evaluations — a percentage
  // from a tiny sample is misleading, so below the threshold the footer is omitted.
  const accuracyOf = (total, errors) => (total > 0 ? 100 - Math.round((errors / total) * 100) : null);
  const enEvalTotal = (metrics.expertScored?.total?.en || 0) + (metrics.aiScored?.total?.en || 0);
  const frEvalTotal = (metrics.expertScored?.total?.fr || 0) + (metrics.aiScored?.total?.fr || 0);
  const enAccuracy = accuracyOf(enEvalTotal, (metrics.expertScored?.hasError?.en || 0) + (metrics.aiScored?.hasError?.en || 0));
  const frAccuracy = accuracyOf(frEvalTotal, (metrics.expertScored?.hasError?.fr || 0) + (metrics.aiScored?.hasError?.fr || 0));
  const accuracyByLangFooter = (enEvalTotal > 10 && frEvalTotal > 10)
    ? t('publicDashboard.charts.accuracyByLang')
        .replace('{en}', fmtPct(enAccuracy))
        .replace('{fr}', fmtPct(frAccuracy))
    : undefined;

  // Content issues (expert evaluations only). Always shown, even at 0.
  const contentIssue = metrics.expertScored?.hasContentIssue || {};

  // Blocked queries (safety counter). Total card + ranked bar breakdown by type.
  const blockedTotal = metrics.blockedQueries?.total || {};
  const blockedBarData = useMemo(() => buildBlockedBarData(metrics.blockedQueries, t), [metrics.blockedQueries, t]);

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

  // Feedback split into helpful / not helpful, classified by score (not the raw
  // yes/no click) so notWanted counts as helpful.
  const feedbackData = useMemo(
    () => buildFeedbackSplitData(metrics.publicFeedbackTotals, metrics.publicFeedbackReasons, t),
    [metrics.publicFeedbackTotals, metrics.publicFeedbackReasons, t],
  );
  const satisfactionPct = filteredPfTotal > 0 ? Math.round(((feedbackData[0]?.value || 0) / filteredPfTotal) * 100) : null;

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

  // Conversation length (sessions broken down by number of questions asked).
  const totalConversations = metrics.totalConversations || 0;
  const sq = metrics.sessionsByQuestionCount || {};
  const sessionDepthData = totalConversations > 0 ? [
    { name: t('publicDashboard.charts.singleQuestion'), value: sq.singleQuestion?.total || 0 },
    { name: t('publicDashboard.charts.twoQuestions'),   value: sq.twoQuestions?.total || 0 },
    { name: t('publicDashboard.charts.threeQuestions'), value: sq.threeQuestions?.total || 0 },
  ].filter(d => d.value > 0) : [];

  const responseTime = metrics.responseTime || {};
  const hasResponseTime = (responseTime.count || 0) > 0;

  return (
    <div>
      <h2 className="dashboard-section-title">
        {t('publicDashboard.overviewTitle')}
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
          {t('publicDashboard.error')}
        </div>
      )}

      {hasFetched.current && metrics.totalQuestions === 0 && !error && (
        <div className="dashboard-warning">
          <span className="dashboard-warning__icon" aria-hidden="true" />
          {t('publicDashboard.noData')}
        </div>
      )}

      {/* KPI row: accuracy donut on the left, stat cards on the right — questions
          asked across the top, content issues and expert evaluated beneath it.
          Below 10 evals the donut is replaced by a placeholder rather than
          dropped, so the row keeps its shape and the reason is on the page. */}
      <div className="dashboard-row">
        <div className="dashboard-col-half">
          {evalTotal >= 10 ? (
            <DonutCard
              title={t('publicDashboard.charts.accuracyDonutTitle')}
              data={accuracyDonutData.length > 0 ? accuracyDonutData : [{ name: t('publicDashboard.charts.noData'), value: 1 }]}
              colours={accuracyDonutData.length > 0 ? [COLOURS.correct, COLOURS.hasError] : [COLOURS.empty]}
              centreValue={accuracyPct !== null ? fmtPct(accuracyPct) : '—'}
              centreLabel={t('publicDashboard.charts.accuracyCentre')}
              centreClass={accuracyPct === null ? undefined : accuracyPct >= 80 ? 'green' : accuracyPct > 50 ? 'orange' : 'red'}
              footer={accuracyByLangFooter}
              lang={lang}
            />
          ) : (
            <NoDataCard
              title={t('publicDashboard.charts.accuracyDonutTitle')}
              message={t('common.notEnoughData')}
            />
          )}
        </div>
        <div className="dashboard-col-half dashboard-col--equal-height">
          <StatCard
            label={t('publicDashboard.kpi.questionsAsked')}
            value={fmtN(totalQuestions)}
            sub={t('publicDashboard.kpi.questionsSub')
              .replace('{en}', fmtN(metrics.totalQuestionsEn))
              .replace('{fr}', fmtN(metrics.totalQuestionsFr))}
          />
          <div className="dashboard-row dashboard-row--nested">
            <StatCard
              label={t('publicDashboard.kpi.contentIssues')}
              value={fmtN(contentIssue.total)}
              sub={t('publicDashboard.kpi.contentIssuesSub')
                .replace('{ni}', fmtN(contentIssue.needsImprovement))
                .replace('{error}', fmtN(contentIssue.hasError))}
            />
            <StatCard
              label={t('publicDashboard.kpi.evaluated')}
              value={fmtN(expertTotal)}
              sub={t('publicDashboard.kpi.evaluatedSub').replace('{pct}', fmtPct(evaluatedPct))}
            />
          </div>
        </div>
      </div>

      {/* Satisfaction breakdown bar (wide) + user satisfaction donut side by side.
          Below 10 responses both are replaced by a single placeholder —
          percentages from tiny samples are misleading. The bars are percentages,
          so the subtitle carries the response total they're computed from. */}
      {filteredPfTotal >= 10 ? (
        <div className="dashboard-row">
          <DonutCard
            title={t('publicDashboard.charts.feedbackBreakdownTitle')}
            data={feedbackData.length > 0 ? feedbackData : [{ name: t('publicDashboard.charts.noData'), value: 1 }]}
            colours={feedbackData.length > 0 ? [COLOURS.satisfactionPositive, COLOURS.satisfactionNegative] : [COLOURS.empty]}
            centreValue={satisfactionPct !== null ? fmtPct(satisfactionPct) : '—'}
            centreLabel={t('publicDashboard.charts.satisfactionCentre').replace('{total}', fmtN(filteredPfTotal))}
            centreMultiLine
            lang={lang}
          />
          <div className="dashboard-chart-wide">
            <DivergingBarCard
              title={t('publicDashboard.charts.feedbackBreakdownTitle')}
              subtitle={t('publicDashboard.charts.feedbackBreakdownSubtitle')
                .replace('{total}', fmtN(filteredPfTotal))}
              data={feedbackReasonsData}
              noDataLabel={t('publicDashboard.charts.noData')}
              lang={lang}
            />
          </div>
        </div>
      ) : (
        <div className="dashboard-section">
          <NoDataCard
            title={t('publicDashboard.charts.feedbackBreakdownTitle')}
            message={t('common.notEnoughData')}
          />
        </div>
      )}

      {/* Conversation length donut. Below 10 conversations, a placeholder. */}
      <div className="dashboard-row">
        <div className="dashboard-col-half">
          {totalConversations >= 10 ? (
            <DonutCard
              title={t('publicDashboard.charts.engagementTitle')}
              subtitle={t('publicDashboard.charts.engagementSubtitle')}
              data={sessionDepthData.length > 0 ? sessionDepthData : [{ name: t('publicDashboard.charts.noData'), value: 1 }]}
              colours={sessionDepthData.length > 0 ? [COLOURS.no, COLOURS.brand, COLOURS.brandDark] : [COLOURS.empty]}
              centreValue={totalConversations > 0 ? fmtN(totalConversations) : '—'}
              centreLabel={t('publicDashboard.charts.conversations')}
              footer={`${fmtN(totalQuestions)} ${t('publicDashboard.charts.questions')} · ${fmtN(totalConversations)} ${t('publicDashboard.charts.conversations')}`}
              lang={lang}
            />
          ) : (
            <NoDataCard
              title={t('publicDashboard.charts.engagementTitle')}
              message={t('common.notEnoughData')}
            />
          )}
        </div>
      </div>

      {/* Top institutions: institution count stat card left, bar chart right. */}
      {departmentData.length > 0 && (
        <div className="dashboard-row">
          <div className="dashboard-col-third dashboard-col--equal-height">
            <StatCard
              label={t('publicDashboard.kpi.partnerCount')}
              value={fmtN(byDepartmentCount)}
            />
          </div>
          <div className="dashboard-chart-wide">
            <HBarCard
              title={t('publicDashboard.charts.departmentsTitle')}
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
        {t('publicDashboard.ops.title')}
      </h2>
      <div className="dashboard-row">
        <div className="dashboard-col-third">
          <StatCard
            label={t('publicDashboard.ops.medianResponseTime')}
            value={hasResponseTime
              ? t('publicDashboard.ops.responseTimeValue').replace('{n}', fmtSec(responseTime.median))
              : '—'}
            sub={hasResponseTime
              ? t('publicDashboard.ops.responseTimeSub').replace('{p95}', fmtSec(responseTime.p95))
              : undefined}
          />
        </div>
      </div>

      {/* Safety metrics */}
      <h2 className="dashboard-section-title">
        {t('publicDashboard.safety.title')}
      </h2>
      {/* Blocked queries — global safety counter. This dashboard has no
          institution filter, so the counter is always in scope.
          Layout: blocked total on the left; chart fills the right. */}
      <div className="dashboard-row">
        <div className="dashboard-col-third">
          <StatCard
            label={t('blockedQueries.totalCardLabel')}
            value={fmtN(blockedTotal.total)}
            sub={t('blockedQueries.langSub')
              .replace('{en}', fmtN(blockedTotal.en))
              .replace('{fr}', fmtN(blockedTotal.fr))}
          />
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
      </>
      )}
    </div>
  );
};

export default PublicDashboard;
