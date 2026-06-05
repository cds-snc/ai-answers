// Pure helpers for turning the shared metric bundle into chart-ready data.
// Used by the exec and partner dashboards. No React / no state — pass a
// translation function (`t`) where translated labels are needed.
import { FEEDBACK_OPTIONS, SCORE_TO_KEY, isPositiveScore } from '../../constants/UserFeedbackOptions.js';
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
  // Fixed order = top→bottom in the horizontal bar (recharts renders the first
  // row at the top). "Has answer error" is intentionally last so it always
  // sits at the bottom of the chart. Harmful is excluded here — it's a subset
  // of "has answer error" and lives on its own harmful/content-issues card.
  return [
    { key: 'correct', colour: COLOURS.correct },
    { key: 'needsImprovement', colour: COLOURS.needsImprovement },
    { key: 'hasCitationError', colour: COLOURS.hasCitationError },
    { key: 'hasError', colour: COLOURS.hasError },
  ]
    .map(({ key, colour }) => ({
      name: t(`metrics.dashboard.qualityBar.${key}`),
      value: pct(sum(key)),
      colour,
      count: sum(key),
    }))
    .filter(d => d.count > 0);
};

// Split public-feedback totals into "positive about AI" vs "negative about AI"
// using the SCORE, not the raw yes/no click. Most 'no' clicks are negative,
// but notWanted ("answer is clear, but not what I wanted to hear") is positive
// feedback about the answer — so we move those buckets from negative to
// positive. Records with no reason stay in their clicked bucket (we have no
// signal to reclassify them). `noReasonsByScore` is the no-direction reason map
// already grouped by score (e.g. from groupByScore). Returns { positive,
// negative } each as { en, fr, total }.
export const splitPublicFeedbackTotals = (totals = {}, noReasonsByScore = {}) => {
  let moveEn = 0, moveFr = 0, moveTotal = 0;
  Object.entries(noReasonsByScore).forEach(([scoreKey, counts]) => {
    if (!isPositiveScore(scoreKey)) return;
    moveEn += counts.en || 0;
    moveFr += counts.fr || 0;
    moveTotal += counts.total || 0;
  });
  return {
    positive: {
      en: (totals.enYes || 0) + moveEn,
      fr: (totals.frYes || 0) + moveFr,
      total: (totals.yes || 0) + moveTotal,
    },
    negative: {
      en: (totals.enNo || 0) - moveEn,
      fr: (totals.frNo || 0) - moveFr,
      total: (totals.no || 0) - moveTotal,
    },
  };
};

const NO_OTHER_SCORE = FEEDBACK_OPTIONS.NO.find(o => o.id === 'other').score;

// Corrected public feedback -> two donut rows (helpful / not helpful),
// classified by score so notWanted counts as helpful (see
// splitPublicFeedbackTotals). Returns [] when there is no public feedback.
export const buildFeedbackSplitData = (publicFeedbackTotals, publicFeedbackReasons, t) => {
  const total = publicFeedbackTotals?.totalQuestionsWithFeedback || 0;
  if (total <= 0) return [];
  const noByScore = groupByScore(publicFeedbackReasons?.no || {}, NO_OTHER_SCORE);
  const { positive, negative } = splitPublicFeedbackTotals(publicFeedbackTotals, noByScore);
  return [
    { name: t('metrics.dashboard.userScored.positive'), value: positive.total },
    { name: t('metrics.dashboard.userScored.negative'), value: negative.total },
  ];
};

// Full public-feedback breakdown -> bar rows (one per reason). Ordered positives
// first (green) then negatives (red); within each group the option order is
// preserved — NOT sorted by count, so the order is stable across date ranges.
// notWanted ("answer is clear, but not what I wanted to hear") is a 'no' reason
// but counts as positive (green). Zero-count reasons are dropped. Returns []
// when there is no public feedback.
export const buildFeedbackReasonsData = (publicFeedbackReasons, t) => {
  const yesByScore = groupByScore(publicFeedbackReasons?.yes || {}, YES_OTHER_SCORE);
  const noByScore = groupByScore(publicFeedbackReasons?.no || {}, NO_OTHER_SCORE);

  const labelFor = (id, dir) => {
    if (id === 'other') {
      return dir === 'yes'
        ? t('metrics.dashboard.userScored.otherYes')
        : t('metrics.dashboard.userScored.otherNo');
    }
    return t(`homepage.publicFeedback.${dir}.options.${id}`);
  };

  const rows = [];
  [['yes', FEEDBACK_OPTIONS.YES, yesByScore], ['no', FEEDBACK_OPTIONS.NO, noByScore]].forEach(([dir, options, byScore]) => {
    options.forEach((opt) => {
      const value = byScore[String(opt.score)]?.total || 0;
      if (value <= 0) return;
      rows.push({ name: labelFor(opt.id, dir), value, positive: isPositiveScore(opt.score) });
    });
  });

  // Positives first, then negatives; stable within each group.
  return [...rows.filter(r => r.positive), ...rows.filter(r => !r.positive)]
    .map(({ name, value, positive }) => ({
      name,
      value,
      colour: positive ? COLOURS.feedbackPositive : COLOURS.feedbackNegative,
    }));
};
