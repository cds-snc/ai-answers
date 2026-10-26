import { describe, it, expect } from 'vitest';
import { detectUrlLanguage } from './urlLanguage.js';

describe('detectUrlLanguage', () => {
  it('detects /en/ URLs regardless of the fallback language', () => {
    expect(detectUrlLanguage('https://www.canada.ca/en/services/taxes.html', 'fr')).toBe('en');
  });

  it('detects /fr/ URLs regardless of the fallback language', () => {
    expect(detectUrlLanguage('https://www.canada.ca/fr/services/impots.html', 'en')).toBe('fr');
  });

  it('falls back to the given language for a URL with no /en//fr/ segment', () => {
    expect(detectUrlLanguage('https://www.canada.ca/', 'fr')).toBe('fr');
    expect(detectUrlLanguage('https://example.com/some/other/path', 'en')).toBe('en');
  });

  it('falls back to "en" by default when no fallback is given', () => {
    expect(detectUrlLanguage('https://example.com/some/path')).toBe('en');
  });

  it('falls back safely for non-string/empty/malformed input', () => {
    expect(detectUrlLanguage(undefined, 'fr')).toBe('fr');
    expect(detectUrlLanguage(null, 'fr')).toBe('fr');
    expect(detectUrlLanguage('', 'fr')).toBe('fr');
    expect(detectUrlLanguage('not a url at all ://', 'fr')).toBe('fr');
  });
});
