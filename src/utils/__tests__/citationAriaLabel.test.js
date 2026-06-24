import { describe, it, expect } from 'vitest';
import { buildAriaLabel } from '../citationAriaLabel.js';

describe('buildAriaLabel', () => {
  describe('Tier 1 — readable slug', () => {
    it('derives label from last readable slug (en)', () => {
      expect(
        buildAriaLabel('https://www.canada.ca/en/services/benefits/employment-insurance.html', 'en')
      ).toBe('Government of Canada — Employment Insurance — canada.ca (opens in new tab)');
    });

    it('derives label from last readable slug (fr) — sentence case', () => {
      expect(
        buildAriaLabel('https://www.canada.ca/fr/services/prestations/ae/assurance-emploi.html', 'fr')
      ).toBe("Gouvernement du Canada — Assurance emploi — canada.ca (s'ouvre dans un nouvel onglet)");
    });

    it('strips locale prefix segments', () => {
      expect(
        buildAriaLabel('https://canada.ca/en/immigration-refugees-citizenship.html', 'en')
      ).toBe('Government of Canada — Immigration Refugees Citizenship — canada.ca (opens in new tab)');
    });

    it('strips file extension before title-casing', () => {
      expect(
        buildAriaLabel('https://canada.ca/en/services/child-family-services.html', 'en')
      ).toBe('Government of Canada — Child Family Services — canada.ca (opens in new tab)');
    });

    it('strips www. from hostname in the label', () => {
      expect(
        buildAriaLabel('https://www.canada.ca/en/services/employment-insurance.html', 'en')
      ).toBe('Government of Canada — Employment Insurance — canada.ca (opens in new tab)');
    });

    it('converts underscores to spaces', () => {
      expect(
        buildAriaLabel('https://canada.ca/en/services/cpp_retirement_pension.html', 'en')
      ).toBe('Government of Canada — Cpp Retirement Pension — canada.ca (opens in new tab)');
    });

    it('decodes percent-encoded path characters (C3)', () => {
      expect(
        buildAriaLabel('https://canada.ca/fr/services/b%C3%A9n%C3%A9fices-emploi.html', 'fr')
      ).toBe("Gouvernement du Canada — Bénéfices emploi — canada.ca (s'ouvre dans un nouvel onglet)");
    });
  });

  describe('Tier 2 — domain registry fallback', () => {
    it('uses registry for purely numeric path (en)', () => {
      expect(
        buildAriaLabel('https://sac-isc.gc.ca/en/12345', 'en')
      ).toBe('Government of Canada — Indigenous Services Canada — sac-isc.gc.ca (opens in new tab)');
    });

    it('returns "Government of Canada — canada.ca" for opaque canada.ca path', () => {
      expect(
        buildAriaLabel('https://canada.ca/en/12345', 'en')
      ).toBe('Government of Canada — canada.ca (opens in new tab)');
    });
  });

  describe('Tier 3 — unregistered GC domain', () => {
    it('prefixes Government of Canada for unregistered gc.ca domain (en)', () => {
      expect(
        buildAriaLabel('https://travel.gc.ca/en/98765', 'en')
      ).toBe('Government of Canada — travel.gc.ca (opens in new tab)');
    });

    it('prefixes Government of Canada for unregistered gc.ca domain (fr)', () => {
      expect(
        buildAriaLabel('https://voyage.gc.ca/fr/98765', 'fr')
      ).toBe("Gouvernement du Canada — voyage.gc.ca (s'ouvre dans un nouvel onglet)");
    });

    it('falls back gracefully for indigenous-language paths', () => {
      expect(
        buildAriaLabel('https://www.rcaanc-cirnac.gc.ca/oji/1654808101029/1654808142553', 'en')
      ).toBe('Government of Canada — rcaanc-cirnac.gc.ca (opens in new tab)');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for malformed URL', () => {
      expect(buildAriaLabel('not-a-url', 'en')).toBe('');
    });

    it('returns empty string for empty string input', () => {
      expect(buildAriaLabel('', 'en')).toBe('');
    });

    it('defaults lang to en when omitted', () => {
      expect(
        buildAriaLabel('https://canada.ca/en/12345')
      ).toBe('Government of Canada — canada.ca (opens in new tab)');
    });

    it('handles protocol-relative URLs (C1)', () => {
      expect(
        buildAriaLabel('//canada.ca/en/services/employment-insurance.html', 'en')
      ).toBe('Government of Canada — Employment Insurance — canada.ca (opens in new tab)');
    });
  });
});
