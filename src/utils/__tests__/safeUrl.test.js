import { describe, it, expect } from 'vitest';
import { safeHttpHref, isAbsoluteHttpUrl } from '../safeUrl.js';

describe('safeHttpHref', () => {
  it('allows normal http(s) URLs unchanged', () => {
    expect(safeHttpHref('https://www.canada.ca/en/services.html')).toBe('https://www.canada.ca/en/services.html');
    expect(safeHttpHref('http://example.com')).toBe('http://example.com');
    expect(safeHttpHref('HTTPS://WWW.CANADA.CA')).toBe('HTTPS://WWW.CANADA.CA');
  });

  it('allows relative links', () => {
    expect(safeHttpHref('/en/services')).toBe('/en/services');
    expect(safeHttpHref('en/services')).toBe('en/services');
  });

  // "//host" resolves to whatever host follows, not the page's own origin;
  // browsers also read "\" as "/" in this position.
  it('blocks protocol-relative links', () => {
    expect(safeHttpHref('//attacker.example/phish')).toBe('');
    expect(safeHttpHref('//www.canada.ca/en')).toBe('');
    expect(safeHttpHref('  //attacker.example')).toBe('');
    expect(safeHttpHref('/\\attacker.example')).toBe('');
    expect(safeHttpHref('\\\\attacker.example')).toBe('');
    expect(safeHttpHref('\\/attacker.example')).toBe('');
  });

  // Browsers drop tab/newline/CR anywhere in a URL and leading control
  // characters, so these still navigate off-site or run script.
  it('blocks links disguised with tabs, newlines or control characters', () => {
    expect(safeHttpHref('/\t/attacker.example')).toBe('');
    expect(safeHttpHref('/\n/attacker.example')).toBe('');
    expect(safeHttpHref('java\tscript:alert(1)')).toBe('');
    expect(safeHttpHref('java\r\nscript:alert(1)')).toBe('');
    expect(safeHttpHref('\u0001javascript:alert(1)')).toBe('');
    expect(safeHttpHref('\t\n')).toBe('');
  });

  it('blocks javascript: scheme (returns empty href)', () => {
    expect(safeHttpHref('javascript:alert(1)')).toBe('');
    expect(safeHttpHref('JavaScript:alert(document.cookie)')).toBe('');
    expect(safeHttpHref('  javascript:alert(1)  ')).toBe('');
  });

  it('blocks data:, vbscript:, file: and other non-http schemes', () => {
    expect(safeHttpHref('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeHttpHref('vbscript:msgbox(1)')).toBe('');
    expect(safeHttpHref('file:///etc/passwd')).toBe('');
  });

  it('handles empty / non-string input', () => {
    expect(safeHttpHref('')).toBe('');
    expect(safeHttpHref('   ')).toBe('');
    expect(safeHttpHref(null)).toBe('');
    expect(safeHttpHref(undefined)).toBe('');
  });
});

describe('isAbsoluteHttpUrl', () => {
  it.each(['https://www.canada.ca/en.html', 'http://example.com', ' https://www.canada.ca '])('accepts %s', (url) => {
    expect(isAbsoluteHttpUrl(url)).toBe(true);
  });

  it.each(['', 'canada.ca/page', '/en/page', '//evil.example', 'javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x', null, 42])('rejects %s', (url) => {
    expect(isAbsoluteHttpUrl(url)).toBe(false);
  });
});
