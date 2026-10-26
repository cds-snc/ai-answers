import { describe, it, expect } from 'vitest';
import { meetsPasswordRule, PASSWORD_MIN_LENGTH } from '../passwordRule.js';

describe('meetsPasswordRule', () => {
  it('accepts a password of exactly the minimum length', () => {
    expect(meetsPasswordRule('a'.repeat(PASSWORD_MIN_LENGTH))).toBe(true);
  });

  it('refuses a password one character short', () => {
    expect(meetsPasswordRule('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
  });

  it('accepts a long passphrase, past bcrypt\'s 72 bytes', () => {
    expect(meetsPasswordRule('correct horse battery staple '.repeat(5))).toBe(true);
  });

  it('counts characters, not UTF-16 units', () => {
    // 7 emoji are 14 UTF-16 units but only 7 characters
    expect(meetsPasswordRule('😀'.repeat(7))).toBe(false);
    expect(meetsPasswordRule('é'.repeat(8))).toBe(true);
  });

  it('refuses anything that is not a string', () => {
    expect(meetsPasswordRule(undefined)).toBe(false);
    expect(meetsPasswordRule(12345678)).toBe(false);
    expect(meetsPasswordRule(['12345678'])).toBe(false);
    expect(meetsPasswordRule({ length: 8 })).toBe(false);
  });
});
