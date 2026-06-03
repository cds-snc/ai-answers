import React, { useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useDashboardMetrics } from '../../hooks/admin/useDashboardMetrics.js';
import { buildQualityData, buildSatisfactionData, buildYesReasonsData } from '../../utils/dashboard/feedbackBreakdown.js';
import DashboardFilterBar from './DashboardFilterBar.js';

const COLOURS = {
  correct: '#2e7d32',
  needsImprovement: '#f9a825',
  hasError: '#e65100',
  hasCitationError: '#bf360c',
  harmful: '#b71c1c',
  yes: '#1565c0',
  no: '#b0bec5',
};

const QUALITY_COLOURS = [
  '#2e7d32', '#f9a825', '#e65100', '#bf360c', '#b71c1c',
];

const StatCard = ({ label, value, sub }) => (
  <div style={{
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '24px 28px',
    flex: 1,
    minWidth: 160,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <div style={{ fontSize: 13, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: 42, fontWeight: 700, color: '#1565c0', lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 13, color: '#888', marginTop: 6 }}>{sub}</div>}
  </div>
);

const DonutCard = ({ title, data, colours, centreValue, centreLabel, height = 260 }) => (
  <div style={{
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '24px 16px',
    flex: 1,
    minWidth: 280,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#333' }}>{title}</div>
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={70} outerRadius={100} dataKey="value" paddingAngle={2}>
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={colours[i % colours.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value, name) => [value.toLocaleString(), name]} />
          <Legend iconType="circle" iconSize={10} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -68%)', textAlign: 'center', pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#1565c0', lineHeight: 1 }}>{centreValue}</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{centreLabel}</div>
      </div>
    </div>
  </div>
);

const HBarCard = ({ title, data, colour = '#1565c0' }) => (
  <div style={{
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '24px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#333' }}>{title}</div>
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value) => value.toLocaleString()} />
        <Bar dataKey="value" fill={colour} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

const PartnerDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
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
          label={t('partnerDashboard.kpi.questionsAsked')}
          value={metrics.totalQuestions.toLocaleString()}
          sub={t('partnerDashboard.kpi.questionsSub', { en: metrics.totalQuestionsEn?.toLocaleString() || 0, fr: metrics.totalQuestionsFr?.toLocaleString() || 0 })}
        />
        <StatCard
          label={t('partnerDashboard.kpi.evaluated')}
          value={expertTotal.toLocaleString()}
          sub={t('partnerDashboard.kpi.evaluatedSub', { pct: expertTotal > 0 && metrics.totalQuestions > 0 ? Math.round((expertTotal / metrics.totalQuestions) * 100) : 0 })}
        />
        <StatCard
          label={t('partnerDashboard.kpi.feedbackReceived')}
          value={pfTotal.toLocaleString()}
        />
      </div>

      {/* Donuts */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <DonutCard
          title={t('partnerDashboard.charts.accuracyTitle')}
          data={qualityData.length > 0 ? qualityData : [{ name: t('partnerDashboard.charts.noData'), value: 1 }]}
          colours={qualityData.length > 0 ? QUALITY_COLOURS : ['#e0e0e0']}
          centreValue={accuracyPct !== null ? `${accuracyPct}%` : '—'}
          centreLabel={t('partnerDashboard.charts.accuracyCentre', { total: expertTotal.toLocaleString() })}
        />
        <DonutCard
          title={t('partnerDashboard.charts.satisfactionTitle')}
          data={satisfactionData.length > 0 ? satisfactionData : [{ name: t('partnerDashboard.charts.noData'), value: 1 }]}
          colours={satisfactionData.length > 0 ? [COLOURS.yes, COLOURS.no] : ['#e0e0e0']}
          centreValue={satisfactionPct !== null ? `${satisfactionPct}%` : '—'}
          centreLabel={t('partnerDashboard.charts.satisfactionCentre', { total: pfTotal.toLocaleString() })}
        />
      </div>

      {/* Yes reasons */}
      {yesReasonsData.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <HBarCard
            title={t('partnerDashboard.charts.yesReasonsTitle')}
            data={yesReasonsData}
            colour='#2e7d32'
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
