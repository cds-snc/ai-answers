import { describe, it, expect } from 'vitest';
import { parseHttpUrl } from '../parseHttpUrl.js';

describe('parseHttpUrl', () => {
  it('returns a URL for absolute http(s) input, trimmed', () => {
    expect(parseHttpUrl('https://www.canada.ca/en.html')?.hostname).toBe('www.canada.ca');
    expect(parseHttpUrl('  http://example.com/a  ')?.href).toBe('http://example.com/a');
  });

  it('returns null for non-strings, blanks and unparseable input', () => {
    for (const raw of [undefined, null, 42, {}, '', '   ', 'not a url', '/en/path', '//www.canada.ca/en']) {
      expect(parseHttpUrl(raw), String(raw)).toBeNull();
    }
  });

  it('returns null for other schemes', () => {
    for (const raw of ['javascript:alert(1)', 'data:text/html,x', 'ftp://www.canada.ca/f', 'file:///etc/passwd']) {
      expect(parseHttpUrl(raw), raw).toBeNull();
    }
  });

  it('returns null when credentials disguise the real host', () => {
    expect(parseHttpUrl('https://www.canada.ca@attacker.example/en')).toBeNull();
    expect(parseHttpUrl('https://user:pw@www.canada.ca/en')).toBeNull();
  });
});
