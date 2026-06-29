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
  // row at the top). Harmful is a mutually exclusive category (higher priority
  // than hasError), so it is folded into the hasError bar explicitly — it does
  // not fall through to hasError on its own.
  return [
    { key: 'correct',          colour: COLOURS.correct },
    { key: 'needsImprovement', colour: COLOURS.needsImprovement, stroke: COLOURS.qualityBorder },
    { key: 'hasCitationError', colour: COLOURS.hasCitationError, stroke: COLOURS.qualityBorder },
    { key: 'hasError',         colour: COLOURS.hasError },
  ]
    .map(({ key, colour, stroke }) => {
      const count = sum(key) + (key === 'hasError' ? sum('harmful') : 0);
      return {
        name: t(`metrics.dashboard.qualityBar.${key}`),
        value: pct(count),
        colour,
        ...(stroke && { stroke, strokeWidth: 1 }),
        count,
      };
    })
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

// Fixed top→bottom display order for the satisfaction breakdown bar. Positives
// first (largest-typical at top: savedTime), then negatives, with each group's
// "Other" last. notWanted is a NO-direction option but sits in the positive
// group (positive about AI). `dir` selects the YES/NO option set for the score
// and the label namespace. Stable across date ranges (NOT sorted by count).
const FEEDBACK_REASON_ORDER = [
  { dir: 'yes', id: 'savedTime' },
  { dir: 'yes', id: 'noCall' },
  { dir: 'yes', id: 'noVisit' },
  { dir: 'no', id: 'notWanted' },
  { dir: 'yes', id: 'other' },
  { dir: 'no', id: 'notDetailed' },
  { dir: 'no', id: 'irrelevant' },
  { dir: 'no', id: 'confusing' },
  { dir: 'no', id: 'brokenLink' },
  { dir: 'no', id: 'other' },
];

const scoreForReason = (dir, id) =>
  FEEDBACK_OPTIONS[dir === 'yes' ? 'YES' : 'NO'].find(o => o.id === id)?.score;

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

// Full public-feedback breakdown -> bar rows (one per reason), in the fixed
// FEEDBACK_REASON_ORDER (positives first/green, then negatives/red) — NOT sorted
// by count, so the order is stable across date ranges. notWanted ("answer is
// clear, but not what I wanted to hear") is a 'no' reason but counts as positive
// (green). Zero-count reasons are dropped. `positive` is carried through so a
// diverging chart can place the row left/right; `colour` stays for the plain bar
// consumers. Returns [] when there is no public feedback.
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

  const filtered = FEEDBACK_REASON_ORDER
    .map(({ dir, id }) => {
      const score = scoreForReason(dir, id);
      const value = (dir === 'yes' ? yesByScore : noByScore)[String(score)]?.total || 0;
      return { dir, id, score, value };
    })
    .filter(r => r.value > 0);

  let posIdx = 0, negIdx = 0;
  return filtered.map(({ dir, id, score, value }) => {
    const positive = isPositiveScore(score);
    const entry = positive
      ? COLOURS.feedbackPositiveScale[posIdx++ % COLOURS.feedbackPositiveScale.length]
      : COLOURS.feedbackNegativeScale[negIdx++ % COLOURS.feedbackNegativeScale.length];
    const colour = entry.fill ?? entry;
    const stroke = entry.stroke;
    return {
      name: labelFor(id, dir),
      value,
      positive,
      colour,
      ...(stroke && { stroke, strokeWidth: 1 }),
    };
  });
};
