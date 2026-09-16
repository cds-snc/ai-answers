import { describe, expect, it } from 'vitest';
import { renderDateTimeCell } from '../dateTimeCell.js';

describe('renderDateTimeCell', () => {
  it('puts the date and the time on separate lines', () => {
    const html = renderDateTimeCell('2026-08-27T14:05:00Z', 'en');
    const [date, time] = html.split('<br>');
    expect(date).toMatch(/2026/);
    expect(date).not.toMatch(/\d{1,2}:\d{2}/);
    expect(time).toMatch(/\d{1,2}:\d{2}/);
  });

  it('formats in the requested language', () => {
    expect(renderDateTimeCell('2026-08-27T14:05:00Z', 'fr').split('<br>')[0]).toMatch(/août/);
  });

  it('returns an empty string for empty or invalid input', () => {
    expect(renderDateTimeCell(null, 'en')).toBe('');
    expect(renderDateTimeCell('', 'en')).toBe('');
    expect(renderDateTimeCell('not a date', 'en')).toBe('');
  });
});
