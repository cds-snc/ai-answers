import { describe, expect, it } from 'vitest';
import { compareVectorMatches } from '../vectorMatchOrdering.js';

describe('compareVectorMatches', () => {
  it('uses latest expert feedback as the tie-breaker', () => {
    const newer = { similarity: 0.9, expertFeedbackCreatedAt: '2026-02-01' };
    const older = { similarity: 0.9, expertFeedbackCreatedAt: '2026-01-01' };

    expect([older, newer].sort(compareVectorMatches)).toEqual([newer, older]);
  });

  it('does not return NaN when both feedback dates are missing or invalid', () => {
    const missing = { similarity: 0.9 };
    const invalid = { similarity: 0.9, expertFeedbackCreatedAt: 'not-a-date' };

    expect([missing, invalid].sort(compareVectorMatches)).toEqual([missing, invalid]);
    expect(compareVectorMatches(missing, invalid)).toBe(0);
  });
});
