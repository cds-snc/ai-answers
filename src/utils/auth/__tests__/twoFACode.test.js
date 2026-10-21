import { describe, it, expect } from 'vitest';
import { normalizeTwoFACode } from '../twoFACode.js';

describe('normalizeTwoFACode', () => {
  it.each([
    ['123456', '123456'],
    [' 123456 ', '123456'],
    ['123 456', '123456'],
    ['012345', '012345'],
  ])('accepts %j as %j', (input, expected) => {
    expect(normalizeTwoFACode(input)).toBe(expected);
  });

  it.each(['', '   ', '12345', '1234567', 'abcdef', '123-456', '12345a'])('refuses %j', (input) => {
    expect(normalizeTwoFACode(input)).toBeNull();
  });

  it.each([[undefined], [null], [123456], [['123456']], [{ code: '123456' }]])('refuses a non-string (%j)', (input) => {
    expect(normalizeTwoFACode(input)).toBeNull();
  });
});
