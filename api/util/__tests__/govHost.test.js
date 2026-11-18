import { describe, it, expect } from 'vitest';
import { isGovernmentHost, isGovernmentUrl } from '../govHost.js';

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

  it('rejects URLs with credentials that disguise the real host', () => {
    expect(isGovernmentUrl('https://www.canada.ca@attacker.example/en')).toBe(false);
    expect(isGovernmentUrl('https://user:pw@www.canada.ca/en')).toBe(false);
  });
});
