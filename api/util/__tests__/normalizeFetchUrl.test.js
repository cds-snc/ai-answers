import { describe, expect, it } from 'vitest';
import { normalizeFetchUrl } from '../normalizeFetchUrl.js';

describe('normalizeFetchUrl', () => {
  it('upgrades http to https', () => {
    expect(
      normalizeFetchUrl('http://inspection.canada.ca/en/animal-health/livestock-feeds')
    ).toBe('https://inspection.canada.ca/en/animal-health/livestock-feeds');
  });

  it('upgrades a mixed-case scheme', () => {
    expect(normalizeFetchUrl('HtTp://inspection.canada.ca/en')).toBe(
      'https://inspection.canada.ca/en'
    );
  });

  it('leaves https URLs untouched', () => {
    const url = 'https://www.canada.ca/en/services/benefits.html';

    expect(normalizeFetchUrl(url)).toBe(url);
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeFetchUrl('  https://www.canada.ca/en  ')).toBe(
      'https://www.canada.ca/en'
    );
  });

  it('rewrites only the scheme, preserving the rest byte for byte', () => {
    // A WHATWG URL round trip would add a trailing slash to the bare host and
    // re-encode the query, changing URLs that were already valid.
    expect(normalizeFetchUrl('http://inspection.canada.ca')).toBe(
      'https://inspection.canada.ca'
    );
    expect(
      normalizeFetchUrl('http://inspection.canada.ca/en/search?q=a b&x=%2F#frag')
    ).toBe('https://inspection.canada.ca/en/search?q=a b&x=%2F#frag');
  });

  it('does not rewrite an http occurrence outside the scheme', () => {
    expect(
      normalizeFetchUrl('https://www.canada.ca/redirect?to=http://example.com')
    ).toBe('https://www.canada.ca/redirect?to=http://example.com');
  });

  it('rejects non-http schemes', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<h1>hi</h1>',
      'file:///etc/passwd',
      'ftp://example.com/file.txt',
    ]) {
      expect(() => normalizeFetchUrl(url)).toThrow(/unsupported scheme/);
    }
  });

  it('rejects values that are not absolute URLs', () => {
    for (const url of ['inspection.canada.ca/en', '/en/animal-health', 'not a url']) {
      expect(() => normalizeFetchUrl(url)).toThrow(/not an absolute URL/);
    }
  });

  it('rejects blank and non-string values', () => {
    expect(() => normalizeFetchUrl('   ')).toThrow(/empty/);
    expect(() => normalizeFetchUrl(null)).toThrow(/expected a string/);
    expect(() => normalizeFetchUrl(undefined)).toThrow(/expected a string/);
    expect(() => normalizeFetchUrl({ url: 'https://example.com' })).toThrow(
      /expected a string/
    );
  });

  it('names the field in the error message', () => {
    expect(() => normalizeFetchUrl('', 'citationUrl')).toThrow(/Invalid citationUrl/);
  });
});
