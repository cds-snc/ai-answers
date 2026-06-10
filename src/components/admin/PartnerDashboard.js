import React, { useMemo, useRef, useState } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useDashboardMetrics } from '../../hooks/admin/useDashboardMetrics.js';
import { buildQualityBarData, buildFeedbackSplitData, buildFeedbackReasonsData } from '../../utils/dashboard/feedbackBreakdown.js';
import FilterPanel from './FilterPanel.js';
import StatCard from './dashboard/StatCard.js';
import DonutCard from './dashboard/DonutCard.js';
import HBarCard from './dashboard/HBarCard.js';
import DivergingBarCard from './dashboard/DivergingBarCard.js';
import { COLOURS } from '../../constants/dashboardColours.js';
import { formatNumber, formatPercent, formatDecimal } from '../../utils/numberFormat.js';

const PartnerDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  const fmtSec = (ms) => formatDecimal((ms || 0) / 1000, lang, 1);
  const pctOrDash = (n) => (n !== null ? fmtPct(n) : '—');
  const { metrics, loading, error, fetchMetrics } = useDashboardMetrics();
  const autoApplyFired = useRef(false);
  const [hasUserApplied, setHasUserApplied] = useState(false);
  const handleApplyFilters = (filters) => {
    if (autoApplyFired.current) {
      // Second+ call is user-triggered: mark as applied so FilterPanel can collapse.
      setHasUserApplied(true);
    }
    autoApplyFired.current = true;
    fetchMetrics(filters);
  };

  // --- Derived data ---

  const expertTotal = metrics.expertScored?.total?.total || 0;
  const qualityData = useMemo(
    () => buildQualityBarData(metrics.expertScored, metrics.aiScored, t),
    [metrics.expertScored, metrics.aiScored, t],
  );

  // Accuracy rate (MetricsDashboard definition): only "has answer error" counts
  // against accuracy — citation issues / needs-improvement scores do not.
  // Total accuracy combines expert + AI evals; the breakdown is by language.
  const accuracyOf = (total, hasError) => (total > 0 ? 100 - Math.round((hasError / total) * 100) : null);
  const expertHasError = metrics.expertScored?.hasError?.total || 0;
  const aiTotal = metrics.aiScored?.total?.total || 0;
  const aiHasError = metrics.aiScored?.hasError?.total || 0;
  const totalAccuracy = accuracyOf(expertTotal + aiTotal, expertHasError + aiHasError);

  // EN/FR accuracy breakdown (expert + AI per language), shown only when each
  // language has more than 10 evaluations — a percentage from a tiny sample is
  // misleading, so below the threshold both are left blank.
  const enEvalTotal = (metrics.expertScored?.total?.en || 0) + (metrics.aiScored?.total?.en || 0);
  const frEvalTotal = (metrics.expertScored?.total?.fr || 0) + (metrics.aiScored?.total?.fr || 0);
  const enAccuracy = accuracyOf(enEvalTotal, (metrics.expertScored?.hasError?.en || 0) + (metrics.aiScored?.hasError?.en || 0));
  const frAccuracy = accuracyOf(frEvalTotal, (metrics.expertScored?.hasError?.fr || 0) + (metrics.aiScored?.hasError?.fr || 0));
  const showAccuracyByLang = enEvalTotal > 10 && frEvalTotal > 10;

  // Harmful + content issues (expert evaluations only). Always shown, even at 0.
  const harmful = metrics.expertScored?.harmful || {};
  const contentIssue = metrics.expertScored?.hasContentIssue || {};

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

  // Operations metrics. Median response time comes from the technical metrics
  // endpoint (milliseconds, shown in seconds); token totals come from usage.
  const responseTime = metrics.responseTime || {};
  const hasResponseTime = (responseTime.count || 0) > 0;

  return (
    <div>
      <div className="mb-600">
        <FilterPanel
          lang={lang}
          onApplyFilters={handleApplyFilters}
          onClearFilters={fetchMetrics}
          isVisible={true}
          autoApply={true}
          applyDisabled={loading}
          defaultUserType="all"
          filterLoading={loading}
          filterError={error}
          filterResultCount={metrics.totalQuestions || 0}
          hasAppliedFilters={hasUserApplied}
        />
      </div>

      {error && (
        <div className="dashboard-error">
          {t('partnerDashboard.error')}
        </div>
      )}

      {hasUserApplied && !loading && metrics.totalQuestions === 0 && !error && (
        <div className="dashboard-warning">
          <span className="dashboard-warning__icon" aria-hidden="true" />
          {t('common.noDataForFilters')}
        </div>
      )}

      <h2 className="dashboard-section-title">{t('partnerDashboard.overviewTitle')}</h2>

      {/* KPI cards */}
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
      </div>

      {/* Answer-quality bar + content issues card */}
      <div className="dashboard-row">
        <div className="dashboard-chart-wide">
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
            lang={lang}
          />
        </div>
        <StatCard
          label={t('partnerDashboard.kpi.contentIssues')}
          value={fmtN(contentIssue.total)}
          sub={t('partnerDashboard.kpi.contentIssuesSub')
            .replace('{ni}', fmtN(contentIssue.needsImprovement))
            .replace('{error}', fmtN(contentIssue.hasError))}
        />
      </div>

      {/* Satisfaction breakdown bar */}
      <div className="dashboard-section">
        <DivergingBarCard
          title={t('partnerDashboard.charts.feedbackBreakdownTitle')}
          data={feedbackReasonsData}
          noDataLabel={t('partnerDashboard.charts.noData')}
          lang={lang}
        />
      </div>

      {/* User satisfaction donut + conversation length donut — equal width */}
      <div className="dashboard-row">
        <DonutCard
          title={t('partnerDashboard.charts.feedbackBreakdownTitle')}
          data={feedbackData.length > 0 ? feedbackData : [{ name: t('partnerDashboard.charts.noData'), value: 1 }]}
          colours={feedbackData.length > 0 ? [COLOURS.feedbackPositive, COLOURS.feedbackNegative] : [COLOURS.empty]}
          centreValue={satisfactionPct !== null ? fmtPct(satisfactionPct) : '—'}
          centreLabel={t('partnerDashboard.charts.satisfactionCentre').replace('{total}', fmtN(pfTotal))}
          lang={lang}
        />
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

    </div>
  );
};

export default PartnerDashboard;
