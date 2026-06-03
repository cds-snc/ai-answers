// Pure helpers for turning the shared metric bundle into chart-ready data.
// Used by the exec and partner dashboards. No React / no state — pass a
// translation function (`t`) where translated labels are needed.
import { FEEDBACK_OPTIONS, SCORE_TO_KEY } from '../../constants/UserFeedbackOptions.js';
import enLocale from '../../locales/en.json';
import frLocale from '../../locales/fr.json';

// Known feedback label string -> score, for legacy records stored by label
// rather than by numeric score.
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

export const YES_OTHER_SCORE = FEEDBACK_OPTIONS.YES.find(o => o.id === 'other').score;

// Collapse raw feedback-reason counts (keyed by numeric score, "other"/"autre",
// or a legacy label string) into a map keyed by score string.
export const groupByScore = (reasons = {}, otherScore = YES_OTHER_SCORE) => {
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

// Expert quality breakdown -> chart rows (translated labels), zero rows dropped.
// Returns [] when nothing has been expert-evaluated.
export const buildQualityData = (expertScored, t) => {
  const total = expertScored?.total?.total || 0;
  if (total <= 0) return [];
  return [
    { name: t('metrics.dashboard.expertScored.correct'), value: expertScored.correct.total },
    { name: t('metrics.dashboard.expertScored.needsImprovement'), value: expertScored.needsImprovement.total },
    { name: t('metrics.dashboard.expertScored.hasError'), value: expertScored.hasError.total },
    { name: t('metrics.dashboard.expertScored.hasCitationError'), value: expertScored.hasCitationError.total },
    { name: t('metrics.dashboard.expertScored.harmful'), value: expertScored.harmful.total },
  ].filter(d => d.value > 0);
};

// Public yes/no satisfaction -> chart rows (translated labels).
// Returns [] when there is no public feedback.
export const buildSatisfactionData = (publicFeedbackTotals, t) => {
  const total = publicFeedbackTotals?.totalQuestionsWithFeedback || 0;
  if (total <= 0) return [];
  return [
    { name: t('metrics.dashboard.userScored.helpful'), value: publicFeedbackTotals.yes || 0 },
    { name: t('metrics.dashboard.userScored.unhelpful'), value: publicFeedbackTotals.no || 0 },
  ];
};

// "Why users found it helpful" reasons -> sorted chart rows with localized
// labels (descending by count, zero rows dropped).
export const buildYesReasonsData = (publicFeedbackReasons, lang) => {
  const grouped = groupByScore(publicFeedbackReasons?.yes || {});
  const localeFile = lang === 'fr' ? frLocale : enLocale;
  return Object.entries(grouped)
    .map(([scoreKey, counts]) => {
      const id = SCORE_TO_KEY[parseInt(scoreKey, 10)];
      const label = id ? (localeFile.homepage?.publicFeedback?.yes?.options?.[id] || id) : scoreKey;
      return { name: label, value: counts.total };
    })
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);
};
