import { describe, expect, it } from 'vitest';
import { isSingular } from '../numberFormat.js';

describe('isSingular', () => {
  it('English: only 1 is singular', () => {
    expect([0, 1, 2].map((n) => isSingular(n, 'en'))).toEqual([false, true, false]);
  });
  it('French: 0 and 1 are singular', () => {
    expect([0, 1, 2].map((n) => isSingular(n, 'fr'))).toEqual([true, true, false]);
  });
});
