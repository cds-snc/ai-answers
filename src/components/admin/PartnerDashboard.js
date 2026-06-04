import React, { useMemo } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useDashboardMetrics } from '../../hooks/admin/useDashboardMetrics.js';
import { buildQualityBarData, buildFeedbackSplitData, buildFeedbackReasonsData } from '../../utils/dashboard/feedbackBreakdown.js';
import DashboardFilterBar from './DashboardFilterBar.js';
import StatCard from './dashboard/StatCard.js';
import DonutCard from './dashboard/DonutCard.js';
import HBarCard from './dashboard/HBarCard.js';
import { COLOURS } from '../../constants/dashboardColours.js';
import { formatNumber, formatPercent } from '../../utils/numberFormat.js';

const PartnerDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  const pctOrDash = (n) => (n !== null ? fmtPct(n) : '—');
  const { metrics, loading, error, fetchMetrics } = useDashboardMetrics();

  // --- Derived data ---

  const expertTotal = metrics.expertScored?.total?.total || 0;
  const qualityData = useMemo(
    () => buildQualityBarData(metrics.expertScored, metrics.aiScored, t),
    [metrics.expertScored, metrics.aiScored, t],
  );

  // Accuracy rate (MetricsDashboard definition): only "has answer error" counts
  // against accuracy — citation issues / needs-improvement scores do not.
  // Total accuracy combines expert + AI evals; the two are also broken out.
  const accuracyOf = (total, hasError) => (total > 0 ? 100 - Math.round((hasError / total) * 100) : null);
  const expertHasError = metrics.expertScored?.hasError?.total || 0;
  const aiTotal = metrics.aiScored?.total?.total || 0;
  const aiHasError = metrics.aiScored?.hasError?.total || 0;
  const expertAccuracy = accuracyOf(expertTotal, expertHasError);
  const aiAccuracy = accuracyOf(aiTotal, aiHasError);
  const totalAccuracy = accuracyOf(expertTotal + aiTotal, expertHasError + aiHasError);

  // User feedback split into helpful / not helpful, classified by score (not
  // the raw yes/no click) so notWanted counts as helpful.
  const pfTotal = metrics.publicFeedbackTotals?.totalQuestionsWithFeedback || 0;
  const feedbackData = useMemo(
    () => buildFeedbackSplitData(metrics.publicFeedbackTotals, metrics.publicFeedbackReasons, t),
    [metrics.publicFeedbackTotals, metrics.publicFeedbackReasons, t],
  );
  const satisfactionPct = pfTotal > 0 ? Math.round(((feedbackData[0]?.value || 0) / pfTotal) * 100) : null;

  const feedbackReasonsData = useMemo(() => buildFeedbackReasonsData(metrics.publicFeedbackReasons, t), [metrics.publicFeedbackReasons, t]);

  return (
    <div style={{ fontFamily: 'inherit' }}>
      <DashboardFilterBar lang={lang} loading={loading} onApply={fetchMetrics} />

      {error && (
        <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 6, padding: '12px 16px', marginBottom: 24, color: '#c62828' }}>
          {t('partnerDashboard.error')}
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard
          uppercase
          label={t('partnerDashboard.kpi.questionsAsked')}
          value={fmtN(metrics.totalQuestions)}
          sub={t('partnerDashboard.kpi.questionsSub')
            .replace('{en}', fmtN(metrics.totalQuestionsEn))
            .replace('{fr}', fmtN(metrics.totalQuestionsFr))}
        />
        <StatCard
          uppercase
          label={t('partnerDashboard.kpi.evaluated')}
          value={fmtN(expertTotal)}
          sub={t('partnerDashboard.kpi.evaluatedSub')
            .replace('{pct}', fmtPct(expertTotal > 0 && metrics.totalQuestions > 0 ? Math.round((expertTotal / metrics.totalQuestions) * 100) : 0))}
        />
        <StatCard
          uppercase
          label={t('partnerDashboard.kpi.accuracyRate')}
          value={pctOrDash(totalAccuracy)}
          sub={t('partnerDashboard.kpi.accuracySub')
            .replace('{expert}', pctOrDash(expertAccuracy))
            .replace('{ai}', pctOrDash(aiAccuracy))}
        />
      </div>

      {/* Answer-quality bar + user-feedback donut */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 320 }}>
          <HBarCard
            title={t('partnerDashboard.charts.accuracyTitle')}
            subtitle={t('partnerDashboard.charts.accuracySubtitle').replace('{total}', fmtN(expertTotal + aiTotal))}
            data={qualityData}
            percent
            height={240}
            noDataLabel={t('partnerDashboard.charts.noData')}
            lang={lang}
          />
        </div>
        <DonutCard
          title={t('partnerDashboard.charts.satisfactionTitle')}
          data={feedbackData.length > 0 ? feedbackData : [{ name: t('partnerDashboard.charts.noData'), value: 1 }]}
          colours={feedbackData.length > 0 ? [COLOURS.feedbackPositive, COLOURS.feedbackNegative] : [COLOURS.empty]}
          centreValue={satisfactionPct !== null ? fmtPct(satisfactionPct) : '—'}
          centreLabel={t('partnerDashboard.charts.satisfactionCentre').replace('{total}', fmtN(pfTotal))}
          lang={lang}
        />
      </div>

      {/* Feedback reasons breakdown (positives green, negatives red) */}
      {feedbackReasonsData.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <HBarCard
            title={t('partnerDashboard.charts.feedbackBreakdownTitle')}
            data={feedbackReasonsData}
            lang={lang}
          />
        </div>
      )}

      {!loading && metrics.totalQuestions === 0 && !error && (
        <p style={{ color: '#888', textAlign: 'center', padding: '40px 0' }}>
          {t('partnerDashboard.noData')}
        </p>
      )}
    </div>
  );
};

export default PartnerDashboard;
