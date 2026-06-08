import React from 'react';
import StatCard from './StatCard.js';
import { formatNumber, formatPercent } from '../../../utils/numberFormat.js';

// Derive the three headline KPIs (questions, expert-evaluated, accuracy) from a
// metrics bundle. Accuracy combines expert + AI evals; the EN/FR breakdown is
// only meaningful when each language has more than 10 evaluations.
const deriveKpis = (metrics) => {
  const accuracyOf = (total, hasError) => (total > 0 ? 100 - Math.round((hasError / total) * 100) : null);
  const totalQuestions = metrics.totalQuestions || 0;
  const expertTotal = metrics.expertScored?.total?.total || 0;
  const aiTotal = metrics.aiScored?.total?.total || 0;
  const expertHasError = metrics.expertScored?.hasError?.total || 0;
  const aiHasError = metrics.aiScored?.hasError?.total || 0;
  const enEvalTotal = (metrics.expertScored?.total?.en || 0) + (metrics.aiScored?.total?.en || 0);
  const frEvalTotal = (metrics.expertScored?.total?.fr || 0) + (metrics.aiScored?.total?.fr || 0);
  return {
    totalQuestions,
    totalQuestionsEn: metrics.totalQuestionsEn || 0,
    totalQuestionsFr: metrics.totalQuestionsFr || 0,
    expertTotal,
    evaluatedPct: expertTotal > 0 && totalQuestions > 0 ? Math.round((expertTotal / totalQuestions) * 100) : 0,
    totalAccuracy: accuracyOf(expertTotal + aiTotal, expertHasError + aiHasError),
    enAccuracy: accuracyOf(enEvalTotal, (metrics.expertScored?.hasError?.en || 0) + (metrics.aiScored?.hasError?.en || 0)),
    frAccuracy: accuracyOf(frEvalTotal, (metrics.expertScored?.hasError?.fr || 0) + (metrics.aiScored?.hasError?.fr || 0)),
    showAccuracyByLang: enEvalTotal > 10 && frEvalTotal > 10,
  };
};

// The exec dashboard's three headline KPI cards (questions asked, expert
// evaluated, accuracy rate), computed from the given metrics bundle. Reused for
// both the last-12-months summary and the filtered date range.
const KpiRow = ({ metrics, t, lang = 'en' }) => {
  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  const pctOrDash = (n) => (n !== null ? fmtPct(n) : '—');
  const k = deriveKpis(metrics);
  return (
    <div className="dashboard-row">
      <StatCard
        label={t('execDashboard.kpi.questionsAsked')}
        value={fmtN(k.totalQuestions)}
        sub={t('execDashboard.kpi.questionsSub')
          .replace('{en}', fmtN(k.totalQuestionsEn))
          .replace('{fr}', fmtN(k.totalQuestionsFr))}
      />
      <StatCard
        label={t('execDashboard.kpi.evaluated')}
        value={fmtN(k.expertTotal)}
        sub={t('execDashboard.kpi.evaluatedSub').replace('{pct}', fmtPct(k.evaluatedPct))}
      />
      <StatCard
        label={t('execDashboard.kpi.accuracyRate')}
        value={pctOrDash(k.totalAccuracy)}
        sub={k.showAccuracyByLang
          ? t('execDashboard.kpi.accuracySub')
              .replace('{en}', fmtPct(k.enAccuracy))
              .replace('{fr}', fmtPct(k.frAccuracy))
          : undefined}
      />
    </div>
  );
};

export default KpiRow;
