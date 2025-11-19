import { sentenceCompareStrategy } from '../sentenceCompareStrategy.js';
import { describe, it, expect } from 'vitest';

describe('sentenceCompareStrategy.parse', () => {
  it('parses a winner JSON object', () => {
    const winnerObj = {
      winner: {
        index: 1,
        candidate: 'Candidate text',
        checks: {
          numbers: { p: 'p' },
          dates_times: { p: 'p' },
          negation: { p: 'p' },
          entities: { p: 'p' },
          quantifiers: { p: 'p' },
          conditionals: { p: 'p' },
          connectives: { p: 'p' },
          modifiers: { p: 'p' }
        }
      }
    };
    const normalized = { content: JSON.stringify(winnerObj), model: 'test-model' };
    const res = sentenceCompareStrategy.parse(normalized);
    expect(res.parsed).toEqual(winnerObj);
    expect(res.raw).toBe(JSON.stringify(winnerObj));
  });

  it('parses an error when invalid JSON present', () => {
    const bad = 'Here is some text and then { not valid json }';
    const normalized = { content: bad, model: 'm' };
    const res = sentenceCompareStrategy.parse(normalized);
    expect(res.parsed).toHaveProperty('error');
    expect(res.parsed.error).toBe('invalid_json');
    expect(res.raw).toBe(bad);
  });
});
