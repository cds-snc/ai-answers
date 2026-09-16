import { describe, it, expect } from 'vitest';
import { isWellFormedHttpUrl } from '../referringUrl.js';

describe('isWellFormedHttpUrl', () => {
  it('accepts well-formed https URLs', () => {
    expect(isWellFormedHttpUrl('https://www.canada.ca/en/services.html')).toBe(true);
  });

  it('accepts well-formed http URLs', () => {
    expect(isWellFormedHttpUrl('http://example.com')).toBe(true);
  });

  it('rejects unparseable strings', () => {
    expect(isWellFormedHttpUrl('not a url')).toBe(false);
    expect(isWellFormedHttpUrl('canada.ca/en')).toBe(false);
  });

  it('rejects non-http(s) protocols', () => {
    expect(isWellFormedHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isWellFormedHttpUrl('ftp://example.com')).toBe(false);
  });

  it('rejects empty or missing input', () => {
    expect(isWellFormedHttpUrl('')).toBe(false);
    expect(isWellFormedHttpUrl(undefined)).toBe(false);
    expect(isWellFormedHttpUrl(null)).toBe(false);
  });
});
