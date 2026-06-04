// Pure helpers for turning the shared metric bundle into chart-ready data.
// Used by the exec and partner dashboards. No React / no state — pass a
// translation function (`t`) where translated labels are needed.
import { FEEDBACK_OPTIONS, SCORE_TO_KEY } from '../../constants/UserFeedbackOptions.js';
import { COLOURS } from '../../constants/dashboardColours.js';
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

// Combined expert + AI quality breakdown -> bar-chart rows, each value a
// PERCENTAGE of all evaluations (expert + AI) and each row carrying its own
// semantic colour (best -> worst). Categories with zero evaluations are
// dropped; rare categories that round below 1% still appear (filtered on the
// raw count, not the percentage) so safety signals stay visible. Returns []
// when nothing has been evaluated.
export const buildQualityBarData = (expertScored, aiScored, t) => {
  const sum = (key) => (expertScored?.[key]?.total || 0) + (aiScored?.[key]?.total || 0);
  const total = sum('total');
  if (total <= 0) return [];
  const pct = (n) => Math.round((n / total) * 100);
  return [
    { key: 'correct', colour: COLOURS.correct },
    { key: 'needsImprovement', colour: COLOURS.needsImprovement },
    { key: 'hasError', colour: COLOURS.hasError },
    { key: 'hasCitationError', colour: COLOURS.hasCitationError },
    { key: 'harmful', colour: COLOURS.harmful },
  ]
    .map(({ key, colour }) => ({
      name: t(`metrics.dashboard.expertScored.${key}`),
      value: pct(sum(key)),
      colour,
      count: sum(key),
    }))
    .filter(d => d.count > 0);
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
