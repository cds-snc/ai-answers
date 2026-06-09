import { describe, it, expect } from 'vitest';
import { safeHttpHref } from '../safeUrl.js';

describe('safeHttpHref', () => {
  it('allows normal http(s) URLs unchanged', () => {
    expect(safeHttpHref('https://www.canada.ca/en/services.html')).toBe('https://www.canada.ca/en/services.html');
    expect(safeHttpHref('http://example.com')).toBe('http://example.com');
    expect(safeHttpHref('HTTPS://WWW.CANADA.CA')).toBe('HTTPS://WWW.CANADA.CA');
  });

  it('allows relative and protocol-relative links', () => {
    expect(safeHttpHref('/en/services')).toBe('/en/services');
    expect(safeHttpHref('//www.canada.ca/en')).toBe('//www.canada.ca/en');
    expect(safeHttpHref('en/services')).toBe('en/services');
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
