import React, { useMemo } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useDashboardMetrics } from '../../hooks/admin/useDashboardMetrics.js';
import { buildQualityData, buildSatisfactionData, buildYesReasonsData } from '../../utils/dashboard/feedbackBreakdown.js';
import DashboardFilterBar from './DashboardFilterBar.js';
import StatCard from './dashboard/StatCard.js';
import DonutCard from './dashboard/DonutCard.js';
import HBarCard from './dashboard/HBarCard.js';

// Colours
const COLOURS = {
  correct: '#2e7d32',
  needsImprovement: '#f9a825',
  hasError: '#e65100',
  hasCitationError: '#bf360c',
  harmful: '#b71c1c',
  yes: '#1565c0',
  no: '#b0bec5',
  bar: '#1565c0',
};

const QUALITY_COLOURS = [
  COLOURS.correct,
  COLOURS.needsImprovement,
  COLOURS.hasError,
  COLOURS.hasCitationError,
  COLOURS.harmful,
];

const ExecDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { metrics, loading, error, fetchMetrics } = useDashboardMetrics();

  // --- Derived data ---

  // Session engagement derived data
  const totalConversations = metrics.totalConversations || 0;
  const totalQuestions = metrics.totalQuestions || 0;
  const avgPerConversation = totalConversations > 0
    ? (totalQuestions / totalConversations).toFixed(1)
    : null;
  const sq = metrics.sessionsByQuestionCount || {};
  const sessionDepthData = totalConversations > 0 ? [
    { name: t('execDashboard.charts.singleQuestion'), value: sq.singleQuestion?.total || 0 },
    { name: t('execDashboard.charts.twoQuestions'),   value: sq.twoQuestions?.total || 0 },
    { name: t('execDashboard.charts.threeQuestions'), value: sq.threeQuestions?.total || 0 },
  ].filter(d => d.value > 0) : [];

  // Partner count — departments with at least 1 expert evaluation
  const partnerCount = Object.values(metrics.byDepartment || {})
    .filter(d => (d.expertScored?.total || 0) > 0).length;

  const expertTotal = metrics.expertScored?.total?.total || 0;
  const expertCorrect = metrics.expertScored?.correct?.total || 0;
  const accuracyPct = expertTotal > 0 ? Math.round((expertCorrect / expertTotal) * 100) : null;
  const qualityData = useMemo(() => buildQualityData(metrics.expertScored, t), [metrics.expertScored, t]);

  const pfTotal = metrics.publicFeedbackTotals?.totalQuestionsWithFeedback || 0;
  const pfYes = metrics.publicFeedbackTotals?.yes || 0;
  const satisfactionPct = pfTotal > 0 ? Math.round((pfYes / pfTotal) * 100) : null;
  const satisfactionData = useMemo(() => buildSatisfactionData(metrics.publicFeedbackTotals, t), [metrics.publicFeedbackTotals, t]);

  const yesReasonsData = useMemo(() => buildYesReasonsData(metrics.publicFeedbackReasons, lang), [metrics.publicFeedbackReasons, lang]);

  const departmentData = useMemo(() => {
    return Object.entries(metrics.byDepartment || {})
      .map(([dept, data]) => ({ name: dept, value: data.total || 0 }))
      .filter(d => d.value > 0 && d.name)
      .sort((a, b) => b.value - a.value);
  }, [metrics.byDepartment]);

  return (
    <div style={{ fontFamily: 'inherit' }}>
      <DashboardFilterBar lang={lang} loading={loading} onApply={fetchMetrics} />

      {error && (
        <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 6, padding: '12px 16px', marginBottom: 24, color: '#c62828' }}>
          {t('execDashboard.error')}
        </div>
      )}

      {/* Row 1: Engagement donut + partner count */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {/* Engagement donut */}
        <div style={{ flex: 2, minWidth: 280 }}>
          <DonutCard
            title={t('execDashboard.charts.engagementTitle')}
            subtitle={t('execDashboard.charts.engagementSubtitle')}
            data={sessionDepthData.length > 0 ? sessionDepthData : [{ name: t('execDashboard.charts.noData'), value: 1 }]}
            colours={sessionDepthData.length > 0 ? ['#b0bec5', '#1565c0', '#0d47a1'] : ['#e0e0e0']}
            centreValue={avgPerConversation !== null ? `${avgPerConversation}×` : '—'}
            centreLabel={t('execDashboard.charts.engagementCentre')}
            footer={`${totalQuestions.toLocaleString()} ${t('execDashboard.charts.questions')} · ${totalConversations.toLocaleString()} ${t('execDashboard.charts.conversations')}`}
          />
        </div>

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
          <div style={{ fontSize: 56, fontWeight: 700, color: '#1565c0', lineHeight: 1 }}>
            {partnerCount}
          </div>
          <div style={{ fontSize: 13, color: '#555', marginTop: 10, lineHeight: 1.4 }}>
            {t('execDashboard.kpi.partnerCountSub')}
          </div>
        </div>

        {/* Evaluated + feedback stat cards */}
        <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <StatCard
            label={t('execDashboard.kpi.evaluated')}
            value={expertTotal.toLocaleString()}
            sub={t('execDashboard.kpi.evaluatedSub', { pct: expertTotal > 0 && metrics.totalQuestions > 0 ? Math.round((expertTotal / metrics.totalQuestions) * 100) : 0 })}
          />
          <StatCard
            label={t('execDashboard.kpi.feedbackReceived')}
            value={pfTotal.toLocaleString()}
          />
        </div>
      </div>

      {/* Row 2: Quality donut + Satisfaction donut */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <DonutCard
          title={t('execDashboard.charts.accuracyTitle')}
          data={qualityData.length > 0 ? qualityData : [{ name: t('execDashboard.charts.noData'), value: 1 }]}
          colours={qualityData.length > 0 ? QUALITY_COLOURS : ['#e0e0e0']}
          centreValue={accuracyPct !== null ? `${accuracyPct}%` : '—'}
          centreLabel={t('execDashboard.charts.accuracyCentre', { total: expertTotal.toLocaleString() })}
        />
        <DonutCard
          title={t('execDashboard.charts.satisfactionTitle')}
          data={satisfactionData.length > 0 ? satisfactionData : [{ name: t('execDashboard.charts.noData'), value: 1 }]}
          colours={satisfactionData.length > 0 ? [COLOURS.yes, COLOURS.no] : ['#e0e0e0']}
          centreValue={satisfactionPct !== null ? `${satisfactionPct}%` : '—'}
          centreLabel={t('execDashboard.charts.satisfactionCentre', { total: pfTotal.toLocaleString() })}
        />
      </div>

      {/* Row 3: Yes reasons horizontal bar */}
      {yesReasonsData.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <HBarCard
            title={t('execDashboard.charts.yesReasonsTitle')}
            data={yesReasonsData}
            colour='#2e7d32'
          />
        </div>
      )}

      {/* Row 4: Top departments horizontal bar */}
      {departmentData.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <HBarCard
            title={t('execDashboard.charts.departmentsTitle')}
            data={departmentData}
            colour={COLOURS.bar}
          />
        </div>
      )}

      {!loading && metrics.totalQuestions === 0 && !error && (
        <p style={{ color: '#888', textAlign: 'center', padding: '40px 0' }}>
          {t('execDashboard.noData')}
        </p>
      )}
    </div>
  );
};

export default ExecDashboard;
