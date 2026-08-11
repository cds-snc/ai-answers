import React, { useMemo, useState, useCallback, useRef } from 'react';
import { GcdsIcon } from '@gcds-core/components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useDashboardMetrics } from '../../hooks/admin/useDashboardMetrics.js';
import DashboardFilterBar from './DashboardFilterBar.js';
import StatCard from './dashboard/StatCard.js';
import DonutCard from './dashboard/DonutCard.js';
import HBarCard from './dashboard/HBarCard.js';
import StackedBarCard from './dashboard/StackedBarCard.js';
import NoDataCard from './dashboard/NoDataCard.js';
import { COLOURS } from '../../constants/dashboardColours.js';
import { buildBlockedBarData } from '../../utils/dashboard/blockedQueryBars.js';
import { formatNumber, formatPercent, formatDecimal } from '../../utils/numberFormat.js';
import StatusMessage from './StatusMessage.js';

const PublicDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  // Passed as `a11y` to every chart card (DonutCard/HBarCard/DivergingBarCard/
  // StackedBarCard) — renders each chart's data as a real, always-visible
  // table alongside the hover-only Recharts tooltip. Required on new charts.
  const chartA11y = {
    categoryLabel: t('common.chartCategoryColumn'),
    valueLabel: t('common.chartValueColumn'),
    percentLabel: t('common.chartPercentColumn'),
    captionTemplate: t('common.chartDataTableCaption'),
    rawDataTableLabel: t('common.chartDataTableSummary'),
  };
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
    { name: t('publicDashboard.charts.singleQuestion'), value: sq.singleQuestion?.total || 0, colour: COLOURS.sessionDepthScale[0], stroke: COLOURS.chartStroke },
    { name: t('publicDashboard.charts.twoQuestions'),   value: sq.twoQuestions?.total || 0,   colour: COLOURS.sessionDepthScale[1] },
    { name: t('publicDashboard.charts.threeQuestions'), value: sq.threeQuestions?.total || 0, colour: COLOURS.sessionDepthScale[2] },
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
        <div className="dashboard-loading" role="status" aria-live="polite">
          {t('common.loading')}
        </div>
      ) : (
      <>

      {error && (
        <StatusMessage isError tag="div" className="dashboard-error">
          <GcdsIcon name="warning-triangle" marginRight="50" />
          {t('publicDashboard.error')}
        </StatusMessage>
      )}

      {hasFetched.current && metrics.totalQuestions === 0 && !error && (
        <div className="dashboard-warning" role="status" aria-live="polite">
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
              a11y={chartA11y}
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
          {/* Expert evaluated sits before content issues: the issues are
              identified by those evaluators, so the count they came from reads first. */}
          <div className="dashboard-row dashboard-row--nested">
            <StatCard
              label={t('publicDashboard.kpi.evaluated')}
              value={fmtN(expertTotal)}
              sub={t('publicDashboard.kpi.evaluatedSub').replace('{pct}', fmtPct(evaluatedPct))}
            />
            <StatCard
              label={t('publicDashboard.kpi.contentIssues')}
              value={fmtN(contentIssue.total)}
              sub={t('publicDashboard.kpi.contentIssuesSub')
                .replace('{ni}', fmtN(contentIssue.needsImprovement))
                .replace('{error}', fmtN(contentIssue.hasError))}
            />
          </div>
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
              a11y={chartA11y}
            />
          </div>
        </div>
      )}

      {/* Conversation length (75% width) + median response time beside it
          (25%, height matched to conversation length via dashboard-row's
          default flex stretch). Below 10 conversations the chart becomes a
          placeholder. */}
      <div className="dashboard-row">
        <div className="dashboard-col-three-quarter">
          {totalConversations >= 10 ? (
            <StackedBarCard
              data={sessionDepthData}
              lang={lang}
              noDataLabel={t('publicDashboard.charts.noData')}
              a11y={chartA11y}
              a11yTitle={t('publicDashboard.charts.engagementTitle')}
              leftContent={(
                <div>
                  <h3 className="card-title card-title--has-subtitle">{t('publicDashboard.charts.engagementTitle')}</h3>
                  <p className="card-subtitle font-size-text-xsm-nr">{t('publicDashboard.charts.engagementSubtitle')}</p>
                  <p className="font-size-text-xsm-nr mb-0">
                    {`${fmtN(totalQuestions)} ${t('publicDashboard.charts.questions')} · ${fmtN(totalConversations)} ${t('publicDashboard.charts.conversations')}`}
                  </p>
                </div>
              )}
            />
          ) : (
            <NoDataCard
              title={t('publicDashboard.charts.engagementTitle')}
              message={t('common.notEnoughData')}
            />
          )}
        </div>
        <div className="dashboard-col-quarter">
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
            a11y={chartA11y}
          />
        </div>
      </div>
      </>
      )}

      {/* Referenced by the footnote marker in PublicDashboardPage's h1 —
          states the userType=public restriction baked into fetchPublicMetrics
          above. Always rendered (not gated on loading/error) since the link
          that points here is always present too.
          WET-BOEW's standard footnote pattern (GCWeb's wb-fnote, not shipped
          by GC DS — reproduced in admin.css): the marker box doubles as the
          "return to referrer" link, so there's no separate visible number. */}
      <aside className="wb-fnote" role="note">
        <h2>{t('dashboardFilter.footnotesHeading')}</h2>
        <dl>
          <dt className="wb-inv">{t('dashboardFilter.footnotesHeading')} 1</dt>
          <dd id="public-dashboard-footnote">
            <p className="font-size-text-xsm-nr">{t('publicDashboard.footnote')}</p>
            <p className="fn-rtn">
              <a href="#public-dashboard-fnref">
                <span className="wb-inv">{t('dashboardFilter.footnoteReturnSrPrefix')}</span>
                1
                <span className="wb-inv">{t('dashboardFilter.footnoteReturnSrSuffix')}</span>
              </a>
            </p>
          </dd>
        </dl>
      </aside>
    </div>
  );
};

export default PublicDashboard;
