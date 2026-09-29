import { describe, it, expect } from 'vitest';
import { formatLabelValue } from '../labelValue.js';

describe('formatLabelValue', () => {
  it('joins with a plain colon in English', () => {
    expect(formatLabelValue('Total', '12', 'en')).toBe('Total: 12');
  });

  it('puts a space before the colon in French', () => {
    expect(formatLabelValue('Total', '12', 'fr')).toBe('Total : 12');
  });
});
