import { describe, it, expect } from 'vitest';
import { buildAriaLabel } from '../citationAriaLabel.js';

describe('buildAriaLabel', () => {
  describe('Tier 1 — readable slug', () => {
    it('derives label from last readable slug (en)', () => {
      expect(
        buildAriaLabel('https://www.canada.ca/en/services/benefits/employment-insurance.html', 'en')
      ).toBe('Employment insurance — canada dot ca (opens in new tab) https://www.canada.ca/en/services/benefits/employment-insurance.html');
    });

    it('derives label from last readable slug (fr)', () => {
      expect(
        buildAriaLabel('https://www.canada.ca/fr/services/prestations/ae/assurance-emploi.html', 'fr')
      ).toBe("Assurance emploi — canada dot ca (s'ouvre dans un nouvel onglet) https://www.canada.ca/fr/services/prestations/ae/assurance-emploi.html");
    });

    it('strips locale prefix segments', () => {
      expect(
        buildAriaLabel('https://canada.ca/en/immigration-refugees-citizenship.html', 'en')
      ).toBe('Immigration refugees citizenship — canada dot ca (opens in new tab) https://canada.ca/en/immigration-refugees-citizenship.html');
    });

    it('strips file extension before slug conversion', () => {
      expect(
        buildAriaLabel('https://canada.ca/en/services/child-family-services.html', 'en')
      ).toBe('Child family services — canada dot ca (opens in new tab) https://canada.ca/en/services/child-family-services.html');
    });

    it('strips www. from hostname in the label', () => {
      expect(
        buildAriaLabel('https://www.canada.ca/en/services/employment-insurance.html', 'en')
      ).toBe('Employment insurance — canada dot ca (opens in new tab) https://www.canada.ca/en/services/employment-insurance.html');
    });

    it('converts underscores to spaces', () => {
      expect(
        buildAriaLabel('https://canada.ca/en/services/cpp_retirement_pension.html', 'en')
      ).toBe('Cpp retirement pension — canada dot ca (opens in new tab) https://canada.ca/en/services/cpp_retirement_pension.html');
    });

    it('resolves bilingual slug daily-quotidien to The Daily in English without dept prefix', () => {
      expect(
        buildAriaLabel('https://www150.statcan.gc.ca/n1/daily-quotidien/250429/dq250429b-eng.htm', 'en')
      ).toBe('The Daily — statcan dot gc dot ca (opens in new tab) https://www150.statcan.gc.ca/n1/daily-quotidien/250429/dq250429b-eng.htm');
    });

    it('resolves bilingual slug daily-quotidien to Le Quotidien in French without dept prefix', () => {
      expect(
        buildAriaLabel('https://www150.statcan.gc.ca/n1/daily-quotidien/250429/dq250429b-fra.htm', 'fr')
      ).toBe("Le Quotidien — statcan dot gc dot ca (s'ouvre dans un nouvel onglet) https://www150.statcan.gc.ca/n1/daily-quotidien/250429/dq250429b-fra.htm");
    });

    it('falls back to readable slug after filtering locale-suffixed opaque codes and catalog numbers, prefixed with dept name', () => {
      expect(
        buildAriaLabel('https://www150.statcan.gc.ca/n1/pub/11-008-x/2008001/article/10517-eng.htm', 'en')
      ).toBe('Statistics Canada — Article — statcan dot gc dot ca (opens in new tab) https://www150.statcan.gc.ca/n1/pub/11-008-x/2008001/article/10517-eng.htm');
    });

    it('keeps readable digit-containing slugs like covid-19', () => {
      expect(
        buildAriaLabel('https://canada.ca/en/public-health/services/diseases/covid-19.html', 'en')
      ).toBe('Covid 19 — canada dot ca (opens in new tab) https://canada.ca/en/public-health/services/diseases/covid-19.html');
    });

    it('decodes percent-encoded path characters (C3)', () => {
      expect(
        buildAriaLabel('https://canada.ca/fr/services/b%C3%A9n%C3%A9fices-emploi.html', 'fr')
      ).toBe("Bénéfices emploi — canada dot ca (s'ouvre dans un nouvel onglet) https://canada.ca/fr/services/b%C3%A9n%C3%A9fices-emploi.html");
    });
  });

  describe('Tier 2 — domain registry fallback', () => {
    it('uses registry for purely numeric path (en)', () => {
      expect(
        buildAriaLabel('https://sac-isc.gc.ca/en/12345', 'en')
      ).toBe('Government of Canada — Indigenous Services Canada — sac-isc dot gc dot ca (opens in new tab) https://sac-isc.gc.ca/en/12345');
    });

    it('uses registry for opaque statcan path (en)', () => {
      expect(
        buildAriaLabel('https://www150.statcan.gc.ca/n1/1310009601', 'en')
      ).toBe('Government of Canada — Statistics Canada — statcan dot gc dot ca (opens in new tab) https://www150.statcan.gc.ca/n1/1310009601');
    });

    it('returns "Government of Canada — canada.ca" for opaque canada.ca path', () => {
      expect(
        buildAriaLabel('https://canada.ca/en/12345', 'en')
      ).toBe('Government of Canada — canada dot ca (opens in new tab) https://canada.ca/en/12345');
    });
  });

  describe('Tier 3 — unregistered GC domain', () => {
    it('prefixes Government of Canada for unregistered gc.ca domain (en)', () => {
      expect(
        buildAriaLabel('https://travel.gc.ca/en/98765', 'en')
      ).toBe('Government of Canada — travel dot gc dot ca (opens in new tab) https://travel.gc.ca/en/98765');
    });

    it('prefixes Government of Canada for unregistered gc.ca domain (fr)', () => {
      expect(
        buildAriaLabel('https://voyage.gc.ca/fr/98765', 'fr')
      ).toBe("Gouvernement du Canada — voyage dot gc dot ca (s'ouvre dans un nouvel onglet) https://voyage.gc.ca/fr/98765");
    });

    it('falls back gracefully for indigenous-language paths', () => {
      expect(
        buildAriaLabel('https://www.rcaanc-cirnac.gc.ca/oji/1654808101029/1654808142553', 'en')
      ).toBe('Government of Canada — rcaanc-cirnac dot gc dot ca (opens in new tab) https://www.rcaanc-cirnac.gc.ca/oji/1654808101029/1654808142553');
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
      ).toBe('Government of Canada — canada dot ca (opens in new tab) https://canada.ca/en/12345');
    });

    it('handles protocol-relative URLs (C1)', () => {
      expect(
        buildAriaLabel('//canada.ca/en/services/employment-insurance.html', 'en')
      ).toBe('Employment insurance — canada dot ca (opens in new tab) //canada.ca/en/services/employment-insurance.html');
    });
  });
});
