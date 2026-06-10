import { describe, it, expect } from 'vitest';
import { buildQualityBarData, splitPublicFeedbackTotals, buildFeedbackReasonsData } from './feedbackBreakdown.js';
import { COLOURS } from '../../constants/dashboardColours.js';
import { isPositiveScore } from '../../constants/UserFeedbackOptions.js';

// Stub translator: echoes the key's last segment so rows are identifiable.
const t = (key) => key.split('.').pop();

const bucket = (n) => ({ total: n });
const scored = ({ total, correct = 0, needsImprovement = 0, hasError = 0, hasCitationError = 0, harmful = 0 }) => ({
  total: bucket(total),
  correct: bucket(correct),
  needsImprovement: bucket(needsImprovement),
  hasError: bucket(hasError),
  hasCitationError: bucket(hasCitationError),
  harmful: bucket(harmful),
});

describe('buildQualityBarData', () => {
  it('returns [] when nothing has been evaluated', () => {
    expect(buildQualityBarData(undefined, undefined, t)).toEqual([]);
    expect(buildQualityBarData(scored({ total: 0 }), scored({ total: 0 }), t)).toEqual([]);
  });

  it('combines expert + AI and reports each category as a percentage of the combined total', () => {
    const expert = scored({ total: 50, correct: 43, needsImprovement: 4, hasError: 3, hasCitationError: 0, harmful: 0 });
    const ai = scored({ total: 50, correct: 40, needsImprovement: 5, hasError: 5, hasCitationError: 0, harmful: 0 });
    const rows = buildQualityBarData(expert, ai, t);
    // total = 100 → values are already percentages
    expect(rows).toEqual([
      { name: 'correct', value: 83, colour: COLOURS.correct, count: 83 },
      { name: 'needsImprovement', value: 9, colour: COLOURS.needsImprovement, stroke: COLOURS.qualityBorder, strokeWidth: 1, count: 9 },
      { name: 'hasError', value: 8, colour: COLOURS.hasError, count: 8 },
    ]);
  });

  it('always orders "Has answer error" last (bottom of the bar) with citation above it', () => {
    const expert = scored({ total: 100, correct: 60, needsImprovement: 10, hasCitationError: 20, hasError: 10 });
    const rows = buildQualityBarData(expert, scored({ total: 0 }), t);
    expect(rows.map((r) => r.name)).toEqual(['correct', 'needsImprovement', 'hasCitationError', 'hasError']);
    expect(rows.map((r) => r.colour)).toEqual([
      COLOURS.correct, COLOURS.needsImprovement, COLOURS.hasCitationError, COLOURS.hasError,
    ]);
  });

  it('keeps rare categories that round below 1% (count > 0) and never includes harmful', () => {
    // 1 citation issue out of 500 = 0.2% → rounds to 0 but stays because count > 0.
    // harmful is a subset of "has answer error" and must not appear as its own bar.
    const expert = scored({ total: 500, correct: 499, hasCitationError: 1, harmful: 5 });
    const rows = buildQualityBarData(expert, scored({ total: 0 }), t);
    const names = rows.map((r) => r.name);
    expect(names).toContain('hasCitationError');
    expect(names).not.toContain('harmful');
    expect(names).not.toContain('needsImprovement');
    const citation = rows.find((r) => r.name === 'hasCitationError');
    expect(citation).toMatchObject({ value: 0, count: 1, colour: COLOURS.hasCitationError });
  });
});

describe('isPositiveScore', () => {
  it('treats all YES scores (1–4) and notWanted (5) as positive', () => {
    expect([1, 2, 3, 4, 5].every(isPositiveScore)).toBe(true);
  });
  it('treats the other NO scores (6–10) as negative', () => {
    expect([6, 7, 8, 9, 10].some(isPositiveScore)).toBe(false);
  });
  it('accepts numeric strings', () => {
    expect(isPositiveScore('5')).toBe(true);
    expect(isPositiveScore('6')).toBe(false);
  });
});

describe('splitPublicFeedbackTotals', () => {
  it('moves notWanted (score 5) from negative to positive, by language', () => {
    // Matches the sample dashboard data: yes 136, no 105, notWanted = 21 (EN 15 / FR 6)
    const totals = { totalQuestionsWithFeedback: 241, yes: 136, no: 105, enYes: 115, enNo: 90, frYes: 21, frNo: 15 };
    const noReasonsByScore = {
      '5': { en: 15, fr: 6, total: 21 }, // notWanted -> positive
      '6': { en: 33, fr: 4, total: 37 },
      '7': { en: 27, fr: 2, total: 29 },
    };
    const { positive, negative } = splitPublicFeedbackTotals(totals, noReasonsByScore);
    expect(positive).toEqual({ en: 130, fr: 27, total: 157 });
    expect(negative).toEqual({ en: 75, fr: 9, total: 84 });
  });

  it('leaves totals unchanged when there are no positive-about-AI no reasons', () => {
    const totals = { yes: 10, no: 5, enYes: 8, enNo: 4, frYes: 2, frNo: 1 };
    const { positive, negative } = splitPublicFeedbackTotals(totals, { '6': { en: 4, fr: 1, total: 5 } });
    expect(positive).toEqual({ en: 8, fr: 2, total: 10 });
    expect(negative).toEqual({ en: 4, fr: 1, total: 5 });
  });

  it('is safe with empty inputs', () => {
    expect(splitPublicFeedbackTotals()).toEqual({
      positive: { en: 0, fr: 0, total: 0 },
      negative: { en: 0, fr: 0, total: 0 },
    });
  });
});

describe('buildFeedbackReasonsData', () => {
  const reasons = {
    // yes reasons by score (1 savedTime higher count to prove no count-sorting)
    yes: { '1': { en: 5, fr: 1, total: 6 }, '3': { en: 85, fr: 13, total: 98 } },
    // no reasons by score: notWanted (5, positive) + negatives 6/7
    no: { '5': { en: 15, fr: 6, total: 21 }, '6': { en: 33, fr: 4, total: 37 }, '7': { en: 27, fr: 2, total: 29 } },
  };

  it('returns [] when there is no feedback', () => {
    expect(buildFeedbackReasonsData({}, t)).toEqual([]);
    expect(buildFeedbackReasonsData(undefined, t)).toEqual([]);
  });

  it('uses the fixed display order (positives first, then negatives), not count order, and colours by score', () => {
    const rows = buildFeedbackReasonsData(reasons, t);
    // Fixed order, zero rows dropped: savedTime(3), noCall(1), notWanted(5)
    // | notDetailed(7), other-no(6). notWanted sits in the positive group;
    // notDetailed precedes other-no per FEEDBACK_REASON_ORDER.
    expect(rows.map(r => r.name)).toEqual(['savedTime', 'noCall', 'notWanted', 'notDetailed', 'otherNo']);
    expect(rows.map(r => r.value)).toEqual([98, 6, 21, 29, 37]);
    expect(rows.map(r => r.colour)).toEqual([
      COLOURS.feedbackPositiveScale[0].fill,
      COLOURS.feedbackPositiveScale[1].fill,
      COLOURS.feedbackPositiveScale[2].fill,
      COLOURS.feedbackNegativeScale[0],
      COLOURS.feedbackNegativeScale[1],
    ]);
  });

  it('drops zero-count reasons', () => {
    const rows = buildFeedbackReasonsData({ yes: { '1': { en: 0, fr: 0, total: 0 } }, no: { '6': { en: 1, fr: 0, total: 1 } } }, t);
    expect(rows.map(r => r.name)).toEqual(['otherNo']);
  });
});
