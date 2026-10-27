import { describe, it, expect } from 'vitest';
import { isValidEmail } from '../validateEmail.js';

describe('isValidEmail', () => {
  it('accepts an ordinary address', () => {
    expect(isValidEmail('person@canada.ca')).toBe(true);
  });

  it.each([
    ['no @', 'account'],
    ['no dot in the domain', 'account@account'],
    ['a space', 'a b@canada.ca'],
  ])('refuses an address with %s', (_label, value) => {
    expect(isValidEmail(value)).toBe(false);
  });

  it('accepts 254 characters and refuses 255 (RFC 5321)', () => {
    const domain = '@canada.ca';
    expect(isValidEmail('a'.repeat(254 - domain.length) + domain)).toBe(true);
    expect(isValidEmail('a'.repeat(255 - domain.length) + domain)).toBe(false);
  });

  it('refuses anything that is not a string', () => {
    expect(isValidEmail(['person@canada.ca'])).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });
});
