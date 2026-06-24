import { describe, it, expect } from 'vitest';
import { normalizeReferralUrl } from '../api/util/normalizeReferralUrl.js';

describe('normalizeReferralUrl', () => {
  it('strips protocol, www, query, fragment and trailing slash', () => {
    expect(normalizeReferralUrl('https://www.canada.ca/en/services/taxes.html?utm=foo'))
      .toBe('canada.ca/en/services/taxes.html');
    expect(normalizeReferralUrl('http://www.canada.ca/en/services/taxes.html/'))
      .toBe('canada.ca/en/services/taxes.html');
    expect(normalizeReferralUrl('www.canada.ca/en/services/taxes.html#section'))
      .toBe('canada.ca/en/services/taxes.html');
  });

  it('collapses protocol and www variants to the same page', () => {
    const a = normalizeReferralUrl('https://www.canada.ca/en/x');
    const b = normalizeReferralUrl('http://canada.ca/en/x/');
    expect(a).toBe(b);
  });

  it('lowercases the host but preserves path case', () => {
    expect(normalizeReferralUrl('HTTPS://WWW.Canada.CA/en/Services'))
      .toBe('canada.ca/en/Services');
  });

  it('keeps host-only URLs', () => {
    expect(normalizeReferralUrl('https://example.gc.ca/')).toBe('example.gc.ca');
  });

  it('handles referrers stored without a protocol', () => {
    expect(normalizeReferralUrl('canada.ca/en/page')).toBe('canada.ca/en/page');
  });

  it('returns null for blank or non-string values', () => {
    expect(normalizeReferralUrl('')).toBeNull();
    expect(normalizeReferralUrl('   ')).toBeNull();
    expect(normalizeReferralUrl(null)).toBeNull();
    expect(normalizeReferralUrl(undefined)).toBeNull();
    expect(normalizeReferralUrl(42)).toBeNull();
  });

  it('drops AI Answers self-referrals (in-app navigation, not a partner page)', () => {
    expect(normalizeReferralUrl('https://ai-answers.alpha.canada.ca/en')).toBeNull();
    expect(normalizeReferralUrl('https://reponses-ia.alpha.canada.ca/fr')).toBeNull();
  });
});
