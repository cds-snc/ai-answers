import { describe, it, expect } from 'vitest';
import { isGovernmentHost, isGovernmentUrl } from '../govHost.js';
import { departments_EN } from '../../../agents/prompts/scenarios/departments_EN.js';
import { departments_FR } from '../../../agents/prompts/scenarios/departments_FR.js';

describe('isGovernmentHost', () => {
  it('accepts canada.ca, gc.ca and their subdomains', () => {
    for (const host of [
      'canada.ca',
      'www.canada.ca',
      'inspection.canada.ca',
      'gc.ca',
      'www.tpsgc-pwgsc.gc.ca',
      'WWW.Canada.CA',
      'www.canada.ca.', // trailing root dot
    ]) {
      expect(isGovernmentHost(host), host).toBe(true);
    }
  });

  it('accepts hosts from the department list, with or without www', () => {
    // rcmp.ca is listed without www; elections.ca and bankofcanada.ca with it.
    for (const host of ['rcmp.ca', 'www.rcmp.ca', 'www.elections.ca', 'elections.ca', 'www.bankofcanada.ca']) {
      expect(isGovernmentHost(host), host).toBe(true);
    }
  });

  // Exact host only: worldcat.org hosts other libraries' catalogues.
  it("accepts LAC's Aurora catalogue host, but not the rest of worldcat.org", () => {
    expect(isGovernmentHost('bac-lac.on.worldcat.org')).toBe(true);
    expect(isGovernmentHost('BAC-LAC.on.worldcat.org')).toBe(true);
    for (const host of ['worldcat.org', 'other.on.worldcat.org', 'x.bac-lac.on.worldcat.org']) {
      expect(isGovernmentHost(host), host).toBe(false);
    }
  });

  // Department hosts the GC doesn't control get no subdomain wildcard.
  it('accepts woudc.org and noradsanta.org, but none of their subdomains', () => {
    for (const host of ['woudc.org', 'www.woudc.org', 'noradsanta.org', 'www.noradsanta.org']) {
      expect(isGovernmentHost(host), host).toBe(true);
    }
    for (const host of ['x.woudc.org', 'evil.noradsanta.org', 'x.www.noradsanta.org']) {
      expect(isGovernmentHost(host), host).toBe(false);
    }
  });

  // canada.multites.net is shared vendor hosting: the host alone isn't enough.
  it('rejects the path-pinned multites host and its subdomains on host alone', () => {
    for (const host of ['canada.multites.net', 'x.canada.multites.net', 'multites.net']) {
      expect(isGovernmentHost(host), host).toBe(false);
    }
  });

  it('accepts the CEEFC host from the department list', () => {
    expect(isGovernmentHost('ceefc-cfuec.ca')).toBe(true);
  });

  it('rejects look-alikes matched only by substring', () => {
    for (const host of [
      'attacker.example',
      'evilcanada.ca',
      'canada.ca.attacker.example',
      'gc.ca.attacker.example',
      'notrcmp.ca',
      'rcmp.ca.attacker.example',
      'canada.com',
      '',
    ]) {
      expect(isGovernmentHost(host), host).toBe(false);
    }
  });

  it('rejects non-string input', () => {
    expect(isGovernmentHost(undefined)).toBe(false);
    expect(isGovernmentHost(null)).toBe(false);
  });
});

describe('isGovernmentUrl', () => {
  it('accepts absolute http(s) URLs on GC hosts', () => {
    expect(isGovernmentUrl('https://www.canada.ca/en.html')).toBe(true);
    expect(isGovernmentUrl('http://inspection.canada.ca/en')).toBe(true);
    expect(isGovernmentUrl('  https://www.canada.ca/en.html  ')).toBe(true);
  });

  it('rejects other schemes, relative URLs and unparseable input', () => {
    for (const url of [
      'ftp://www.canada.ca/file',
      'javascript:alert(1)',
      '//www.canada.ca/en',
      '/en/services.html',
      'www.canada.ca/en',
      'not a url',
      '',
      undefined,
    ]) {
      expect(isGovernmentUrl(url), String(url)).toBe(false);
    }
  });

  it('accepts every URL in the department list', () => {
    for (const dept of [...departments_EN, ...departments_FR]) {
      expect(isGovernmentUrl(dept.url), dept.url).toBe(true);
    }
  });

  it('accepts canada.multites.net only under the thesaurus paths', () => {
    for (const url of [
      'https://canada.multites.net/cst/index.htm',
      'https://canada.multites.net/tsb/index.htm',
      'https://CANADA.multites.net/cst/EN/page.htm',
    ]) {
      expect(isGovernmentUrl(url), url).toBe(true);
    }
    for (const url of [
      'https://canada.multites.net/',
      'https://canada.multites.net/other-tenant/index.htm',
      'https://canada.multites.net/cstx/index.htm',
      'https://canada.multites.net/cst', // no trailing slash: not under /cst/
      'https://canada.multites.net/cst/../other/index.htm', // parser resolves ..
      'https://canada.multites.net/cst/..%2Fother/index.htm',
      'https://canada.multites.net/cst/%2e%2e/other/index.htm',
      'https://canada.multites.net/cst/..%5Cother/index.htm',
      'https://x.canada.multites.net/cst/index.htm',
      'https://www.canada.multites.net/cst/index.htm',
    ]) {
      expect(isGovernmentUrl(url), url).toBe(false);
    }
  });

  it('rejects URLs with credentials that disguise the real host', () => {
    expect(isGovernmentUrl('https://www.canada.ca@attacker.example/en')).toBe(false);
    expect(isGovernmentUrl('https://user:pw@www.canada.ca/en')).toBe(false);
  });
});
