import React, { useMemo } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useDashboardMetrics } from '../../hooks/admin/useDashboardMetrics.js';
import { buildQualityData, buildSatisfactionData, buildYesReasonsData } from '../../utils/dashboard/feedbackBreakdown.js';
import DashboardFilterBar from './DashboardFilterBar.js';
import StatCard from './dashboard/StatCard.js';
import DonutCard from './dashboard/DonutCard.js';
import HBarCard from './dashboard/HBarCard.js';
import { COLOURS, QUALITY_COLOURS } from '../../constants/dashboardColours.js';
import { formatNumber, formatPercent } from '../../utils/numberFormat.js';

const PartnerDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  const { metrics, loading, error, fetchMetrics } = useDashboardMetrics();

  // --- Derived data ---

  const expertTotal = metrics.expertScored?.total?.total || 0;
  const expertCorrect = metrics.expertScored?.correct?.total || 0;
  const accuracyPct = expertTotal > 0 ? Math.round((expertCorrect / expertTotal) * 100) : null;
  const qualityData = useMemo(() => buildQualityData(metrics.expertScored, t), [metrics.expertScored, t]);

  const pfTotal = metrics.publicFeedbackTotals?.totalQuestionsWithFeedback || 0;
  const pfYes = metrics.publicFeedbackTotals?.yes || 0;
  const satisfactionPct = pfTotal > 0 ? Math.round((pfYes / pfTotal) * 100) : null;
  const satisfactionData = useMemo(() => buildSatisfactionData(metrics.publicFeedbackTotals, t), [metrics.publicFeedbackTotals, t]);

  const yesReasonsData = useMemo(() => buildYesReasonsData(metrics.publicFeedbackReasons, lang), [metrics.publicFeedbackReasons, lang]);

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
          label={t('partnerDashboard.kpi.feedbackReceived')}
          value={fmtN(pfTotal)}
        />
      </div>

      {/* Donuts */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <DonutCard
          title={t('partnerDashboard.charts.accuracyTitle')}
          data={qualityData.length > 0 ? qualityData : [{ name: t('partnerDashboard.charts.noData'), value: 1 }]}
          colours={qualityData.length > 0 ? QUALITY_COLOURS : [COLOURS.empty]}
          centreValue={accuracyPct !== null ? fmtPct(accuracyPct) : '—'}
          centreLabel={t('partnerDashboard.charts.accuracyCentre').replace('{total}', fmtN(expertTotal))}
          lang={lang}
        />
        <DonutCard
          title={t('partnerDashboard.charts.satisfactionTitle')}
          data={satisfactionData.length > 0 ? satisfactionData : [{ name: t('partnerDashboard.charts.noData'), value: 1 }]}
          colours={satisfactionData.length > 0 ? [COLOURS.yes, COLOURS.no] : [COLOURS.empty]}
          centreValue={satisfactionPct !== null ? fmtPct(satisfactionPct) : '—'}
          centreLabel={t('partnerDashboard.charts.satisfactionCentre').replace('{total}', fmtN(pfTotal))}
          lang={lang}
        />
      </div>

      {/* Yes reasons */}
      {yesReasonsData.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <HBarCard
            title={t('partnerDashboard.charts.yesReasonsTitle')}
            data={yesReasonsData}
            colour={COLOURS.correct}
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
