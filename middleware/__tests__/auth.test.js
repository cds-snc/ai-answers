import { describe, expect, it } from 'vitest';
import { withProtection } from '../auth.js';

describe('withProtection', () => {
  it('throws when no authentication or authorization middleware is supplied', () => {
    expect(() => withProtection(() => {})).toThrow(
      'withProtection requires at least one authentication or authorization middleware'
    );
  });
});
