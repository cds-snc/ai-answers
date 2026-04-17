import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { useTranslations } from '../../hooks/useTranslations.js';
import MetricsService from '../../services/MetricsService.js';
import { FEEDBACK_OPTIONS, SCORE_TO_KEY } from '../../constants/UserFeedbackOptions.js';
import enLocale from '../../locales/en.json';
import frLocale from '../../locales/fr.json';

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

// Reverse map: known label string → score (for legacy records)
const LABEL_TO_SCORE = (() => {
  const map = {};
  ['YES', 'NO'].forEach(type => {
    const feedbackType = type.toLowerCase();
    FEEDBACK_OPTIONS[type].forEach(opt => {
      const enLabel = enLocale.homepage?.publicFeedback?.[feedbackType]?.options?.[opt.id];
      const frLabel = frLocale.homepage?.publicFeedback?.[feedbackType]?.options?.[opt.id];
      if (enLabel) map[enLabel] = opt.score;
      if (frLabel) map[frLabel] = opt.score;
    });
  });
  return map;
})();

const YES_OTHER_SCORE = FEEDBACK_OPTIONS.YES.find(o => o.id === 'other').score;

const groupByScore = (reasons, otherScore) => {
  const grouped = {};
  Object.entries(reasons).forEach(([key, counts]) => {
    const numericScore = parseInt(key, 10);
    let scoreKey;
    if (!isNaN(numericScore) && SCORE_TO_KEY[numericScore]) {
      scoreKey = String(numericScore);
    } else if (/^(other|autre)\b/i.test(key)) {
      scoreKey = String(otherScore);
    } else if (LABEL_TO_SCORE[key]) {
      scoreKey = String(LABEL_TO_SCORE[key]);
    } else {
      scoreKey = 'unknown';
    }
    if (!grouped[scoreKey]) grouped[scoreKey] = { en: 0, fr: 0, total: 0 };
    grouped[scoreKey].en += counts.en;
    grouped[scoreKey].fr += counts.fr;
    grouped[scoreKey].total += counts.total;
  });
  return grouped;
};

const today = () => new Date().toISOString().split('T')[0];

// Update trial dates here when confirmed
const DATE_PERIODS = [
  { id: 'allTime',  startDate: '2024-01-01',   endDate: today() },
  { id: 'trial1',   startDate: '2024-01-01',   endDate: '2024-01-01' }, // TODO: update dates
  { id: 'trial2',   startDate: '2024-01-01',   endDate: '2024-01-01' }, // TODO: update dates
  { id: 'trial3',   startDate: '2024-01-01',   endDate: '2024-01-01' }, // TODO: update dates
];

// KPI stat card
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
    <div style={{ fontSize: 13, color: '#666', marginBottom: 6, letterSpacing: '0.02em' }}>{label}</div>
    <div style={{ fontSize: 42, fontWeight: 700, color: '#1565c0', lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 13, color: '#888', marginTop: 6 }}>{sub}</div>}
  </div>
);

// Donut chart with a big label in the centre
const DonutCard = ({ title, subtitle, data, colours, centreValue, centreLabel, footer, height = 260 }) => (
  <div style={{
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '24px 16px',
    flex: 1,
    minWidth: 280,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: subtitle ? 4 : 12, color: '#333' }}>{title}</div>
    {subtitle && <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>{subtitle}</div>}
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={100}
            dataKey="value"
            paddingAngle={2}
          >
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={colours[i % colours.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value, name) => [value.toLocaleString(), name]} />
          <Legend iconType="circle" iconSize={10} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -68%)',
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#1565c0', lineHeight: 1 }}>{centreValue}</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{centreLabel}</div>
      </div>
    </div>
    {footer && (
      <div style={{ textAlign: 'center', fontSize: 13, color: '#666', marginTop: 4, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
        {footer}
      </div>
    )}
  </div>
);

// Horizontal bar chart card
const HBarCard = ({ title, data, height, colour = COLOURS.bar }) => (
  <div style={{
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '24px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#333' }}>{title}</div>
    <ResponsiveContainer width="100%" height={height || Math.max(200, data.length * 40)}>
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

const initialState = {
  totalQuestions: 0,
  totalQuestionsEn: 0,
  totalQuestionsFr: 0,
  totalConversations: 0,
  sessionsByQuestionCount: {
    singleQuestion: { total: 0 },
    twoQuestions: { total: 0 },
    threeQuestions: { total: 0 },
  },
  expertScored: { total: { total: 0 }, correct: { total: 0 }, needsImprovement: { total: 0 }, hasError: { total: 0 }, hasCitationError: { total: 0 }, harmful: { total: 0 } },
  publicFeedbackTotals: { totalQuestionsWithFeedback: 0, yes: 0, no: 0 },
  publicFeedbackReasons: { yes: {}, no: {} },
  byDepartment: {},
};

const ExecDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [periodId, setPeriodId] = useState('allTime');
  const [metrics, setMetrics] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const fetchAll = useCallback(async (start, end) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setLoading(true);
    setError(null);
    const filters = { startDate: start, endDate: end };

    try {
      const [usage, session, expert, publicFb, dept] = await Promise.all([
        MetricsService.getUsageMetrics(filters, signal),
        MetricsService.getSessionMetrics(filters, signal),
        MetricsService.getExpertMetrics(filters, signal),
        MetricsService.getPublicFeedbackMetrics(filters, signal),
        MetricsService.getDepartmentMetrics(filters, signal),
      ]);
      if (!signal.aborted) {
        setMetrics({ ...initialState, ...usage, ...session, ...expert, ...publicFb, ...dept });
      }
    } catch (err) {
      if (!signal.aborted) {
        setError(err.message || t('execDashboard.error'));
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const period = DATE_PERIODS.find(p => p.id === periodId) || DATE_PERIODS[0];
    fetchAll(period.startDate, period.endDate);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [periodId, fetchAll]);

  const handlePeriodChange = (e) => setPeriodId(e.target.value);

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

  const qualityData = expertTotal > 0 ? [
    { name: t('metrics.dashboard.expertScored.correct'), value: metrics.expertScored.correct.total },
    { name: t('metrics.dashboard.expertScored.needsImprovement'), value: metrics.expertScored.needsImprovement.total },
    { name: t('metrics.dashboard.expertScored.hasError'), value: metrics.expertScored.hasError.total },
    { name: t('metrics.dashboard.expertScored.hasCitationError'), value: metrics.expertScored.hasCitationError.total },
    { name: t('metrics.dashboard.expertScored.harmful'), value: metrics.expertScored.harmful.total },
  ].filter(d => d.value > 0) : [];

  const pfTotal = metrics.publicFeedbackTotals?.totalQuestionsWithFeedback || 0;
  const pfYes = metrics.publicFeedbackTotals?.yes || 0;
  const pfNo = metrics.publicFeedbackTotals?.no || 0;
  const satisfactionPct = pfTotal > 0 ? Math.round((pfYes / pfTotal) * 100) : null;

  const satisfactionData = pfTotal > 0 ? [
    { name: t('metrics.dashboard.userScored.helpful'), value: pfYes },
    { name: t('metrics.dashboard.userScored.unhelpful'), value: pfNo },
  ] : [];

  const yesReasons = useMemo(() => {
    const raw = metrics.publicFeedbackReasons?.yes || {};
    return groupByScore(raw, YES_OTHER_SCORE);
  }, [metrics.publicFeedbackReasons]);

  const yesReasonsData = useMemo(() => {
    const localeFile = lang === 'fr' ? frLocale : enLocale;
    return Object.entries(yesReasons)
      .map(([scoreKey, counts]) => {
        const id = SCORE_TO_KEY[parseInt(scoreKey, 10)];
        const label = id
          ? (localeFile.homepage?.publicFeedback?.yes?.options?.[id] || id)
          : scoreKey;
        return { name: label, value: counts.total };
      })
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [yesReasons, lang]);

  const departmentData = useMemo(() => {
    return Object.entries(metrics.byDepartment || {})
      .map(([dept, data]) => ({ name: dept, value: data.total || 0 }))
      .filter(d => d.value > 0 && d.name)
      .sort((a, b) => b.value - a.value);
  }, [metrics.byDepartment]);

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {/* Period selector */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label htmlFor="exec-period" style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {t('execDashboard.filter.period')}
        </label>
        <select
          id="exec-period"
          value={periodId}
          onChange={handlePeriodChange}
          disabled={loading}
          style={{ padding: '7px 12px', border: '1px solid #bdbdbd', borderRadius: 4, fontSize: 14, minWidth: 200 }}
        >
          {DATE_PERIODS.map(p => (
            <option key={p.id} value={p.id}>{t(`execDashboard.filter.periods.${p.id}`)}</option>
          ))}
        </select>
        {loading && <span style={{ fontSize: 13, color: '#888' }}>{t('execDashboard.filter.loading')}</span>}
      </div>

      {error && (
        <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 6, padding: '12px 16px', marginBottom: 24, color: '#c62828' }}>
          {error}
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
