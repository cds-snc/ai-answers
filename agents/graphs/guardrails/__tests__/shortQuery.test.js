import { describe, expect, it } from 'vitest';
import { BLOCK_TYPE } from '../blockTypes.js';
import { ShortQueryValidation, validateShortQueryOrThrow } from '../index.js';

describe('short query guardrail', () => {
  it('throws a typed guardrail error for first-turn one or two word queries', () => {
    expect(() => validateShortQueryOrThrow([], 'passport', 'en', 'ircc'))
      .toThrow(ShortQueryValidation);

    try {
      validateShortQueryOrThrow([], 'passport', 'en', 'ircc');
    } catch (error) {
      expect(error.blockType).toBe(BLOCK_TYPE.TOO_SHORT);
      expect(error.userMessage).toBe('passport');
      expect(error.fallbackUrl).toContain('/services/immigration-citizenship/search.html');
      expect(error.fallbackUrl).toContain('q=passport');
    }
  });

  it('allows short follow-up queries after a longer user message', () => {
    const history = [{ sender: 'user', text: 'How do I renew my passport?' }];

    expect(() => validateShortQueryOrThrow(history, 'cost?', 'en', 'ircc'))
      .not.toThrow();
  });
});
