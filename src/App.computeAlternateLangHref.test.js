/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { computeAlternateLangHref } from './App.js';

// Regression coverage for the site-wide EN/FR header toggle. Review-mode
// pages (?chat=...&review=1&adminLang=...) need the toggle to swap only
// `adminLang` in the query string - the route's own `lang` path segment is
// pinned to the reviewed chat's own pageLanguage (WCAG 3.1.2 /
// official-languages.md Rule 2) and must never change on toggle, since the
// chat transcript itself (ChatAppContainer -> ChatInterface, keyed off
// `lang`) reads that route segment. Everything else in review mode -
// ChatReviewPage.js's H1/nav, this App shell's own header/footer/status
// banner, ChatInterface.js's inline eval tooling - keys off `adminLang`
// instead, so it should follow the toggle normally.
describe('computeAlternateLangHref', () => {
  it('swaps the path lang segment and preserves search/hash outside review mode (unchanged existing behaviour)', () => {
    const location = { pathname: '/en/about', search: '?foo=bar', hash: '#section' };
    const { alternateLangHref, currentLang } = computeAlternateLangHref(location);

    expect(currentLang).toBe('en');
    expect(alternateLangHref).toContain('/fr/');
    expect(alternateLangHref).toContain('?foo=bar');
    expect(alternateLangHref).toContain('#section');
  });

  it('in review mode, swaps adminLang in the query string and leaves the path lang segment untouched', () => {
    const location = {
      pathname: '/en',
      search: '?chat=abc123&review=1&adminLang=fr',
      hash: '',
    };
    const { alternateLangHref, currentLang } = computeAlternateLangHref(location);

    // currentLang drives the App shell's own chrome (header/footer/status
    // banner) and document.documentElement.lang - it should follow adminLang
    // in review mode, not the route's own /en path segment.
    expect(currentLang).toBe('fr');
    // The path itself (the reviewed chat's own pageLanguage) must not change.
    expect(alternateLangHref.startsWith('/en?')).toBe(true);
    expect(alternateLangHref).not.toContain('/fr');
    // adminLang flips to the other language; chat/review params are preserved.
    const params = new URLSearchParams(alternateLangHref.split('?')[1]);
    expect(params.get('adminLang')).toBe('en');
    expect(params.get('chat')).toBe('abc123');
    expect(params.get('review')).toBe('1');
  });

  it('in review mode with no adminLang in the URL, defaults to the route\'s own lang before flipping', () => {
    const location = { pathname: '/fr', search: '?chat=abc123&review=1', hash: '' };
    const { alternateLangHref, currentLang } = computeAlternateLangHref(location);

    // No adminLang present - HomePage.js's own fallback is `lang` (the route),
    // so the toggle's starting point should be 'fr' (from the /fr path), and
    // the computed currentLang for chrome purposes reflects that same fallback.
    expect(currentLang).toBe('fr');
    expect(alternateLangHref.startsWith('/fr?')).toBe(true);
    const params = new URLSearchParams(alternateLangHref.split('?')[1]);
    expect(params.get('adminLang')).toBe('en');
  });

  it('a ?chat=X URL without review=1 is not treated as review mode (uses normal path-swap behaviour)', () => {
    const location = { pathname: '/en', search: '?chat=abc123', hash: '' };
    const { alternateLangHref, currentLang } = computeAlternateLangHref(location);

    expect(currentLang).toBe('en');
    expect(alternateLangHref.startsWith('/fr')).toBe(true);
  });
});
