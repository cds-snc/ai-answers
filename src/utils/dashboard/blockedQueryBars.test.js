import { describe, it, expect } from 'vitest';
import { buildBlockedBarData } from './blockedQueryBars.js';

// Labels are resolved through t(); the tests assert on the key so they don't
// depend on the locale files.
const t = (key) => key;

describe('buildBlockedBarData', () => {
  it('merges the two privacy stages into a single Private details row', () => {
    const rows = buildBlockedBarData({
      piStage1: { total: 12, en: 9, fr: 3 },
      piStage2: { total: 6, en: 4, fr: 2 },
    }, t);

    expect(rows).toEqual([
      { name: 'blockedQueries.types.privateDetails', value: 18, en: 13, fr: 5 },
    ]);
  });

  it('keeps a merged row when only one privacy stage has counts', () => {
    const rows = buildBlockedBarData({ piStage2: { total: 3, en: 1, fr: 2 } }, t);

    expect(rows).toEqual([
      { name: 'blockedQueries.types.privateDetails', value: 3, en: 1, fr: 2 },
    ]);
  });

  it('preserves the fixed pipeline order and drops zero rows', () => {
    const rows = buildBlockedBarData({
      unsupportedLanguage: { total: 4, en: 4, fr: 0 },
      tooShort: { total: 20, en: 15, fr: 5 },
      piStage1: { total: 1, en: 1, fr: 0 },
      profanity: { total: 0, en: 0, fr: 0 },
    }, t);

    expect(rows.map((r) => r.name)).toEqual([
      'blockedQueries.types.tooShort',
      'blockedQueries.types.privateDetails',
      'blockedQueries.types.unsupportedLanguage',
    ]);
  });

  it('returns no rows for an empty or missing bundle', () => {
    expect(buildBlockedBarData({}, t)).toEqual([]);
    expect(buildBlockedBarData(undefined, t)).toEqual([]);
  });
});
