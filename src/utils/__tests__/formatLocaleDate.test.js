import { describe, expect, it } from 'vitest';
import { formatLocaleDate } from '../formatLocaleDate.js';

describe('formatLocaleDate', () => {
  it('formats a valid date string', () => {
    const result = formatLocaleDate('2026-08-11T12:00:00.000Z', 'en');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  it('returns the fallback for a falsy value instead of the Unix epoch', () => {
    // `new Date(null)` is 1970-01-01, not "no date" — a falsy value must be
    // caught before ever reaching `new Date()`.
    expect(formatLocaleDate(null, 'en', 'N/A')).toBe('N/A');
    expect(formatLocaleDate(undefined, 'en', 'N/A')).toBe('N/A');
    expect(formatLocaleDate('', 'en', 'N/A')).toBe('N/A');
  });

  it('returns the fallback for a malformed date instead of "Invalid Date"', () => {
    expect(formatLocaleDate('not-a-date', 'en', 'N/A')).toBe('N/A');
  });

  it('defaults the fallback to null', () => {
    expect(formatLocaleDate('not-a-date', 'en')).toBeNull();
  });

  it('passes Intl.DateTimeFormat options through to toLocaleString', () => {
    const result = formatLocaleDate('2026-08-11T12:00:00.000Z', 'en', null, { year: 'numeric' });
    expect(result).toContain('2026');
  });
});
