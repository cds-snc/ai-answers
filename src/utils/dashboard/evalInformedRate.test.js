import { describe, expect, it } from 'vitest';
import { formatEvalInformedRate, getEvalInformedFromDate } from './evalInformedRate.js';
import { formatPercent } from '../numberFormat.js';

const en = (n) => formatPercent(n, 'en');
const fr = (n) => formatPercent(n, 'fr');

describe('formatEvalInformedRate', () => {
  it('shows a dash when no questions were eligible', () => {
    expect(formatEvalInformedRate(0, 0, en)).toBe('—');
    expect(formatEvalInformedRate(undefined, undefined, en)).toBe('—');
  });

  it('rounds to a whole percent', () => {
    expect(formatEvalInformedRate(58, 312, en)).toBe('19%');
    expect(formatEvalInformedRate(0, 312, en)).toBe('0%');
    expect(formatEvalInformedRate(312, 312, en)).toBe('100%');
  });

  it('never rounds a non-zero count down to 0 %', () => {
    expect(formatEvalInformedRate(1, 312, en)).toBe('<1%');
    expect(formatEvalInformedRate(1, 312, fr)).toBe('<1 %');
  });

  it('never rounds a partial count up to 100 %', () => {
    expect(formatEvalInformedRate(311, 312, en)).toBe('>99%');
  });
});

describe('getEvalInformedFromDate', () => {
  it('returns the first eligible date when the range starts on an earlier day', () => {
    expect(getEvalInformedFromDate('2026-08-04T15:00:00', '2026-07-01T09:00:00')).toBe('2026-08-04T15:00:00');
  });

  it('returns null when eligible questions start the same day as the range', () => {
    expect(getEvalInformedFromDate('2026-10-08T15:00:00', '2026-10-08T09:00:00')).toBeNull();
  });

  it('returns null when either date is missing or invalid', () => {
    expect(getEvalInformedFromDate(null, '2026-07-01T09:00:00')).toBeNull();
    expect(getEvalInformedFromDate('2026-08-04T15:00:00', null)).toBeNull();
    expect(getEvalInformedFromDate('garbage', '2026-07-01T09:00:00')).toBeNull();
  });
});
