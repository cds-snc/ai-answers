import React, { useMemo, useRef, useState } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useDashboardMetrics } from '../../hooks/admin/useDashboardMetrics.js';
import { buildQualityBarData, buildFeedbackSplitData, buildFeedbackReasonsData } from '../../utils/dashboard/feedbackBreakdown.js';
import FilterPanel from './FilterPanel.js';
import StatCard from './dashboard/StatCard.js';
import DonutCard from './dashboard/DonutCard.js';
import HBarCard from './dashboard/HBarCard.js';
import DivergingBarCard from './dashboard/DivergingBarCard.js';
import ReferralUrlsCard from './dashboard/ReferralUrlsCard.js';
import CitationPagesCard from './dashboard/CitationPagesCard.js';
import { COLOURS } from '../../constants/dashboardColours.js';
import { BLOCK_QUERY_TYPES } from '../../constants/blockedQueryTypes.js';
import { formatNumber, formatPercent, formatDecimal } from '../../utils/numberFormat.js';

const PartnerDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  const fmtSec = (ms) => formatDecimal((ms || 0) / 1000, lang, 1);
  const pctOrDash = (n) => (n !== null ? fmtPct(n) : '—');
  const { metrics, loading, error, fetchMetrics } = useDashboardMetrics({ includeReferrals: true, includeCitations: true });
  const autoApplyFired = useRef(false);
  const [hasUserApplied, setHasUserApplied] = useState(false);
  const [appliedDepartment, setAppliedDepartment] = useState('');
  const handleApplyFilters = (filters) => {
    if (autoApplyFired.current) {
      // Second+ call is user-triggered: mark as applied so FilterPanel can collapse.
      setHasUserApplied(true);
    }
    autoApplyFired.current = true;
    setAppliedDepartment(filters?.department || '');
    fetchMetrics(filters);
  };
  const handleClearFilters = (filters) => {
    setAppliedDepartment(filters?.department || '');
    fetchMetrics(filters);
  };

  // --- Derived data ---

  const expertTotal = metrics.expertScored?.total?.total || 0;
  const qualityData = useMemo(
    () => buildQualityBarData(metrics.expertScored, metrics.aiScored, t),
    [metrics.expertScored, metrics.aiScored, t],
  );

  // Quality bar tooltip shows the raw count — the percentage is already on the
  // bar label, so repeating it adds nothing (mirrors the satisfaction chart).
  const QualityBarTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip__title">{row.name}</div>
        <div>{fmtN(row.count)}</div>
      </div>
    );
  };

  // Accuracy rate: "has answer error" AND "harmful" count against accuracy —
  // they are mutually exclusive categories, so harmful must be added separately.
  // Citation issues / needs-improvement do not affect accuracy. Total accuracy
  // combines expert + AI evals; the breakdown is by language.
  const accuracyOf = (total, hasError) => (total > 0 ? 100 - Math.round((hasError / total) * 100) : null);
  const expertHasError = (metrics.expertScored?.hasError?.total || 0) + (metrics.expertScored?.harmful?.total || 0);
  const aiTotal = metrics.aiScored?.total?.total || 0;
  const aiHasError = (metrics.aiScored?.hasError?.total || 0) + (metrics.aiScored?.harmful?.total || 0);
  const totalAccuracy = accuracyOf(expertTotal + aiTotal, expertHasError + aiHasError);

  // EN/FR accuracy breakdown (expert + AI per language), shown only when each
  // language has more than 10 evaluations — a percentage from a tiny sample is
  // misleading, so below the threshold both are left blank.
  const enEvalTotal = (metrics.expertScored?.total?.en || 0) + (metrics.aiScored?.total?.en || 0);
  const frEvalTotal = (metrics.expertScored?.total?.fr || 0) + (metrics.aiScored?.total?.fr || 0);
  const enAccuracy = accuracyOf(enEvalTotal,
    (metrics.expertScored?.hasError?.en || 0) + (metrics.aiScored?.hasError?.en || 0)
    + (metrics.expertScored?.harmful?.en || 0) + (metrics.aiScored?.harmful?.en || 0));
  const frAccuracy = accuracyOf(frEvalTotal,
    (metrics.expertScored?.hasError?.fr || 0) + (metrics.aiScored?.hasError?.fr || 0)
    + (metrics.expertScored?.harmful?.fr || 0) + (metrics.aiScored?.harmful?.fr || 0));
  const showAccuracyByLang = enEvalTotal > 10 && frEvalTotal > 10;

  // Harmful + content issues (expert evaluations only). Always shown, even at 0.
  const harmful = metrics.expertScored?.harmful || {};
  const contentIssue = metrics.expertScored?.hasContentIssue || {};

  // Blocked queries (safety counter). Total card + ranked bar breakdown by type.
  // Can't be department-scoped (blocks happen before the department is known),
  // so the blocked view is hidden when a department filter is applied.
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

  // User feedback split into helpful / not helpful, classified by score (not
  // the raw yes/no click) so notWanted counts as helpful.
  const pfTotal = metrics.publicFeedbackTotals?.totalQuestionsWithFeedback || 0;
  const feedbackData = useMemo(
    () => buildFeedbackSplitData(metrics.publicFeedbackTotals, metrics.publicFeedbackReasons, t),
    [metrics.publicFeedbackTotals, metrics.publicFeedbackReasons, t],
  );
  const satisfactionPct = pfTotal > 0 ? Math.round(((feedbackData[0]?.value || 0) / pfTotal) * 100) : null;

  const feedbackReasonsData = useMemo(() => buildFeedbackReasonsData(metrics.publicFeedbackReasons, t), [metrics.publicFeedbackReasons, t]);

  // Conversation length (sessions broken down by number of questions asked).
  const totalConversations = metrics.totalConversations || 0;
  const totalQuestions = metrics.totalQuestions || 0;
  const sq = metrics.sessionsByQuestionCount || {};
  const sessionDepthData = totalConversations > 0 ? [
    { name: t('partnerDashboard.charts.singleQuestion'), value: sq.singleQuestion?.total || 0 },
    { name: t('partnerDashboard.charts.twoQuestions'),   value: sq.twoQuestions?.total || 0 },
    { name: t('partnerDashboard.charts.threeQuestions'), value: sq.threeQuestions?.total || 0 },
  ].filter(d => d.value > 0) : [];

  // Top referring pages (distinct conversations / click-throughs per page).
  // Already normalized, merged and ranked server-side; scoped to the selected
  // department when a partner is applied, otherwise the global top pages.
  const topReferrals = metrics.topReferrals || [];

  // Top citation pages (GC pages AI Answers cited, by question) + the answer-type
  // breakdown (how many questions got a citation vs. a non-citation answer type).
  // Both come from metrics-citations; `normal` answers are the ones with a citation.
  const topCitations = metrics.topCitations || [];
  const answerTypeRows = useMemo(() => {
    const bd = metrics.answerTypeBreakdown || {};
    return [
      { key: 'normal', type: 'normal' },
      { key: 'clarifying-question', type: 'clarifyingQuestion' },
      { key: 'pt-muni', type: 'ptMuni' },
      { key: 'not-gc', type: 'notGc' },
    ].map(({ key, type }) => ({ key, label: t(`partnerDashboard.citations.types.${type}`), count: bd[key] || 0 }));
  }, [metrics.answerTypeBreakdown, t]);

  // Operations metrics. Median response time comes from the technical metrics
  // endpoint (milliseconds, shown in seconds); token totals come from usage.
  const responseTime = metrics.responseTime || {};
  const hasResponseTime = (responseTime.count || 0) > 0;

  return (
    <div>
      <div className="mb-100">
        {/* TODO: Advanced filters (answer type, partner eval, AI eval, URL) are passed to the
            API and filter the aggregate data, but PartnerDashboard has no charts that surface
            those breakdowns. Either hide the advanced section or add corresponding chart sections. */}
        <FilterPanel
          lang={lang}
          onApplyFilters={handleApplyFilters}
          onClearFilters={handleClearFilters}
          isVisible={true}
          autoApply={true}
          applyDisabled={loading}
          defaultUserType="all"
          defaultOpen={false}
          filterLoading={loading}
          filterError={error}
          filterResultCount={metrics.totalQuestions || 0}
          hasAppliedFilters={hasUserApplied}
        />
      </div>

      {loading ? (
        <div className="dashboard-loading">
          {t('common.loading')}
        </div>
      ) : (
      <>

      {error && (
        <div className="dashboard-error">
          {t('partnerDashboard.error')}
        </div>
      )}

      {hasUserApplied && metrics.totalQuestions === 0 && !error && (
        <div className="dashboard-warning">
          <span className="dashboard-warning__icon" aria-hidden="true" />
          {t('common.noDataForFilters')}
        </div>
      )}

      <h2 className="dashboard-section-title">{t('partnerDashboard.overviewTitle')}</h2>

      {/* KPI cards — 4 columns: questions, expert eval, accuracy, content issues */}
      <div className="dashboard-row">
        <StatCard
          label={t('partnerDashboard.kpi.questionsAsked')}
          value={fmtN(metrics.totalQuestions)}
          sub={t('partnerDashboard.kpi.questionsSub')
            .replace('{en}', fmtN(metrics.totalQuestionsEn))
            .replace('{fr}', fmtN(metrics.totalQuestionsFr))}
        />
        <StatCard
          label={t('partnerDashboard.kpi.evaluated')}
          value={fmtN(expertTotal)}
          sub={t('partnerDashboard.kpi.evaluatedSub')
            .replace('{pct}', fmtPct(expertTotal > 0 && metrics.totalQuestions > 0 ? Math.round((expertTotal / metrics.totalQuestions) * 100) : 0))}
        />
        <StatCard
          label={t('partnerDashboard.kpi.accuracyRate')}
          value={pctOrDash(totalAccuracy)}
          sub={showAccuracyByLang
            ? t('partnerDashboard.kpi.accuracySub')
                .replace('{en}', fmtPct(enAccuracy))
                .replace('{fr}', fmtPct(frAccuracy))
            : undefined}
        />
        <StatCard
          label={t('partnerDashboard.kpi.contentIssues')}
          value={fmtN(contentIssue.total)}
          sub={t('partnerDashboard.kpi.contentIssuesSub')
            .replace('{ni}', fmtN(contentIssue.needsImprovement))
            .replace('{error}', fmtN(contentIssue.hasError))}
        />
      </div>

      {/* Answer-quality bar — full width. Hidden below 10 evals. */}
      {(expertTotal + aiTotal) >= 10 && (
      <div className="dashboard-section">
        <HBarCard
          title={t('partnerDashboard.charts.accuracyTitle')}
          subtitle={t('partnerDashboard.charts.accuracySubtitle')
            .replace('{total}', fmtN(expertTotal + aiTotal))
            .replace('{expert}', fmtN(expertTotal))
            .replace('{ai}', fmtN(aiTotal))}
          data={qualityData}
          percent
          height={240}
          noDataLabel={t('partnerDashboard.charts.noData')}
          tooltipContent={QualityBarTooltip}
          lang={lang}
        />
      </div>
      )}

      {/* Satisfaction breakdown bar (wide) + user satisfaction donut side by side.
          Hidden below 10 responses — percentages from tiny samples are misleading. */}
      {pfTotal >= 10 && (
        <div className="dashboard-row">
          <DonutCard
            title={t('partnerDashboard.charts.feedbackBreakdownTitle')}
            data={feedbackData.length > 0 ? feedbackData : [{ name: t('partnerDashboard.charts.noData'), value: 1 }]}
            colours={feedbackData.length > 0 ? [COLOURS.satisfactionPositive, COLOURS.satisfactionNegative] : [COLOURS.empty]}
            centreValue={satisfactionPct !== null ? fmtPct(satisfactionPct) : '—'}
            centreLabel={t('partnerDashboard.charts.satisfactionCentre').replace('{total}', fmtN(pfTotal))}
            centreMultiLine
            lang={lang}
          />
          <div className="dashboard-chart-wide">
            <DivergingBarCard
              title={t('partnerDashboard.charts.feedbackBreakdownTitle')}
              data={feedbackReasonsData}
              noDataLabel={t('partnerDashboard.charts.noData')}
              lang={lang}
            />
          </div>
        </div>
      )}

      {/* Conversation length donut. Hidden below 10 conversations. */}
      {totalConversations >= 10 && (
      <div className="dashboard-row">
        <div className="dashboard-col-half">
          <DonutCard
            title={t('partnerDashboard.charts.engagementTitle')}
            subtitle={t('partnerDashboard.charts.engagementSubtitle')}
            data={sessionDepthData.length > 0 ? sessionDepthData : [{ name: t('partnerDashboard.charts.noData'), value: 1 }]}
            colours={sessionDepthData.length > 0 ? [COLOURS.no, COLOURS.brand, COLOURS.brandDark] : [COLOURS.empty]}
            centreValue={totalConversations > 0 ? fmtN(totalConversations) : '—'}
            centreLabel={t('partnerDashboard.charts.conversations')}
            footer={`${fmtN(totalQuestions)} ${t('partnerDashboard.charts.questions')} · ${fmtN(totalConversations)} ${t('partnerDashboard.charts.conversations')}`}
            lang={lang}
          />
        </div>
      </div>
      )}

      {/* Top referral pages — collapsible list of the partner site pages that
          drove the most click-throughs (conversations) to AI Answers. Hidden
          when there are no referrals to show. */}
      {topReferrals.length > 0 && (
        <div className="dashboard-section">
          <ReferralUrlsCard
            title={t('partnerDashboard.referrals.title')}
            subtitle={t('partnerDashboard.referrals.subtitle')}
            data={topReferrals}
            urlColLabel={t('partnerDashboard.referrals.colUrl')}
            countColLabel={t('partnerDashboard.referrals.colCount')}
            noDataLabel={t('partnerDashboard.charts.noData')}
            lang={lang}
          />
        </div>
      )}

      {/* Top citation pages — collapsible list of the GC pages AI Answers cited
          most (by question), plus an answer-type breakdown. Hidden when there
          are no citations and no answer-type counts to show. */}
      {(topCitations.length > 0 || answerTypeRows.some((r) => r.count > 0)) && (
        <div className="dashboard-section">
          <CitationPagesCard
            title={t('partnerDashboard.citations.title')}
            subtitle={t('partnerDashboard.citations.subtitle')}
            citations={topCitations}
            urlColLabel={t('partnerDashboard.citations.colUrl')}
            countColLabel={t('partnerDashboard.citations.colCount')}
            answerTypesTitle={t('partnerDashboard.citations.answerTypesTitle')}
            answerTypeColLabel={t('partnerDashboard.citations.answerTypeColLabel')}
            answerTypeRows={answerTypeRows}
            noDataLabel={t('partnerDashboard.citations.noCitations')}
            lang={lang}
          />
        </div>
      )}

      {/* Operations metrics. Median response time is drawn from the technical
          metrics endpoint (ms, displayed in seconds); token totals come from
          the usage endpoint. */}
      <h2 className="dashboard-section-title">
        {t('partnerDashboard.ops.title')}
      </h2>
      <div className="dashboard-row">
        <StatCard
          label={t('partnerDashboard.ops.medianResponseTime')}
          value={hasResponseTime
            ? t('partnerDashboard.ops.responseTimeValue').replace('{n}', fmtSec(responseTime.median))
            : '—'}
          sub={hasResponseTime
            ? t('partnerDashboard.ops.responseTimeSub').replace('{p95}', fmtSec(responseTime.p95))
            : undefined}
        />
        <StatCard
          className="stat-card--wide"
          label={t('partnerDashboard.ops.inputTokens')}
          value={fmtN(metrics.totalInputTokens)}
          sub={t('partnerDashboard.ops.tokensSub')
            .replace('{en}', fmtN(metrics.totalInputTokensEn))
            .replace('{fr}', fmtN(metrics.totalInputTokensFr))}
        />
        <StatCard
          className="stat-card--wide"
          label={t('partnerDashboard.ops.outputTokens')}
          value={fmtN(metrics.totalOutputTokens)}
          sub={t('partnerDashboard.ops.tokensSub')
            .replace('{en}', fmtN(metrics.totalOutputTokensEn))
            .replace('{fr}', fmtN(metrics.totalOutputTokensFr))}
        />
      </div>

      {/* Safety metrics */}
      <h2 className="dashboard-section-title">
        {t('partnerDashboard.safety.title')}
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
                label={t('partnerDashboard.kpi.harmful')}
                value={fmtN(harmful.total)}
                sub={t('partnerDashboard.kpi.harmfulSub')
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
              label={t('partnerDashboard.kpi.harmful')}
              value={fmtN(harmful.total)}
              sub={t('partnerDashboard.kpi.harmfulSub')
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

export default PartnerDashboard;
