import { describe, it, expect } from 'vitest';
import { buildQualityBarData, splitPublicFeedbackTotals } from './feedbackBreakdown.js';
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
      { name: 'needsImprovement', value: 9, colour: COLOURS.needsImprovement, count: 9 },
      { name: 'hasError', value: 8, colour: COLOURS.hasError, count: 8 },
    ]);
  });

  it('drops categories with zero evaluations but keeps rare ones that round below 1%', () => {
    // 1 harmful out of 500 = 0.2% → rounds to 0 but stays because count > 0
    const expert = scored({ total: 500, correct: 499, harmful: 1 });
    const rows = buildQualityBarData(expert, scored({ total: 0 }), t);
    const names = rows.map((r) => r.name);
    expect(names).toContain('harmful');
    expect(names).not.toContain('needsImprovement');
    const harmful = rows.find((r) => r.name === 'harmful');
    expect(harmful).toMatchObject({ value: 0, count: 1, colour: COLOURS.harmful });
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
