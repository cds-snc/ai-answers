import { describe, expect, it } from 'vitest';
import { normalizeFetchUrl } from '../normalizeFetchUrl.js';

describe('normalizeFetchUrl', () => {
  it('upgrades http to https', () => {
    expect(
      normalizeFetchUrl('http://inspection.canada.ca/en/animal-health/livestock-feeds')
    ).toBe('https://inspection.canada.ca/en/animal-health/livestock-feeds');
  });

  it('upgrades a mixed-case scheme', () => {
    expect(normalizeFetchUrl('HtTp://inspection.canada.ca/en')).toBe(
      'https://inspection.canada.ca/en'
    );
  });

  it('leaves https URLs untouched', () => {
    const url = 'https://www.canada.ca/en/services/benefits.html';

    expect(normalizeFetchUrl(url)).toBe(url);
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeFetchUrl('  https://www.canada.ca/en  ')).toBe(
      'https://www.canada.ca/en'
    );
  });

  it('rewrites only the scheme, preserving the rest byte for byte', () => {
    // A WHATWG URL round trip would add a trailing slash to the bare host and
    // re-encode the query, changing URLs that were already valid.
    expect(normalizeFetchUrl('http://inspection.canada.ca')).toBe(
      'https://inspection.canada.ca'
    );
    expect(
      normalizeFetchUrl('http://inspection.canada.ca/en/search?q=a b&x=%2F#frag')
    ).toBe('https://inspection.canada.ca/en/search?q=a b&x=%2F#frag');
  });

  it('does not rewrite an http occurrence outside the scheme', () => {
    expect(
      normalizeFetchUrl('https://www.canada.ca/redirect?to=http://example.com')
    ).toBe('https://www.canada.ca/redirect?to=http://example.com');
  });

  it('checks the port after the http upgrade', () => {
    // :80 is http's default, so it's dropped with the upgrade, the same way
    // guardRedirect treats a redirect hop to :80.
    expect(normalizeFetchUrl('http://www.canada.ca:80/en.html')).toBe('https://www.canada.ca/en.html');
    expect(normalizeFetchUrl('http://www.canada.ca:80')).toBe('https://www.canada.ca');
    expect(normalizeFetchUrl('http://www.canada.ca:80?q=1')).toBe('https://www.canada.ca?q=1');
    // Only the authority's port: ":80" elsewhere in the URL is left alone.
    expect(normalizeFetchUrl('http://www.canada.ca/a:80/b')).toBe('https://www.canada.ca/a:80/b');
    // https://host:80 was asked for explicitly and is still refused.
    expect(() => normalizeFetchUrl('https://www.canada.ca:80/en.html')).toThrow(/Blocked/);
    expect(() => normalizeFetchUrl('http://www.canada.ca:8080/en.html')).toThrow(/Blocked/);
    // :443 is not http's default, but it is https's.
    expect(normalizeFetchUrl('http://www.canada.ca:443/en.html')).toBe(
      'https://www.canada.ca:443/en.html'
    );
  });

  it('rejects non-http schemes', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<h1>hi</h1>',
      'file:///etc/passwd',
      'ftp://example.com/file.txt',
    ]) {
      expect(() => normalizeFetchUrl(url)).toThrow(/unsupported scheme/);
    }
  });

  it('rejects values that are not absolute URLs', () => {
    for (const url of ['inspection.canada.ca/en', '/en/animal-health', 'not a url']) {
      expect(() => normalizeFetchUrl(url)).toThrow(/not an absolute URL/);
    }
  });

  it('rejects blank and non-string values', () => {
    expect(() => normalizeFetchUrl('   ')).toThrow(/empty/);
    expect(() => normalizeFetchUrl(null)).toThrow(/expected a string/);
    expect(() => normalizeFetchUrl(undefined)).toThrow(/expected a string/);
    expect(() => normalizeFetchUrl({ url: 'https://example.com' })).toThrow(
      /expected a string/
    );
  });

  // AIA-010: the URL is model-chosen; only GC hosts may be fetched.
  it('blocks hosts that are not Government of Canada sites', () => {
    for (const url of [
      'https://attacker.example/phish',
      'https://canada.ca.attacker.example/en',
      'https://www.canada.ca@attacker.example/en',
      'https://127.0.0.1/',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/',
      'https://[::1]/',
      'http://internal-service/',
    ]) {
      expect(() => normalizeFetchUrl(url), url).toThrow(/only Government of Canada sites/);
    }
  });

  it('blocks non-default ports, allows explicit default ones', () => {
    expect(() => normalizeFetchUrl('https://www.canada.ca:8443/en')).toThrow(/only Government of Canada sites/);
    expect(normalizeFetchUrl('https://www.canada.ca:443/en')).toBe('https://www.canada.ca:443/en');
  });

  it('allows department-list hosts', () => {
    expect(normalizeFetchUrl('https://www.rcmp.ca/en')).toBe('https://www.rcmp.ca/en');
  });

  // Shared vendor hosting: only the GC thesaurus paths, never other tenants.
  it('allows canada.multites.net only under the thesaurus paths', () => {
    const thesaurus = 'https://canada.multites.net/cst/index.htm';
    expect(normalizeFetchUrl(thesaurus)).toBe(thesaurus);
    for (const url of [
      'https://canada.multites.net/other-tenant/index.htm',
      'https://canada.multites.net/cst/..%2Fother-tenant/index.htm',
      'https://x.canada.multites.net/cst/index.htm',
    ]) {
      expect(() => normalizeFetchUrl(url), url).toThrow(/only Government of Canada sites/);
    }
  });

  it('allows woudc.org and noradsanta.org, but not their subdomains', () => {
    expect(normalizeFetchUrl('https://woudc.org/en/about')).toBe('https://woudc.org/en/about');
    expect(normalizeFetchUrl('https://www.noradsanta.org/en/')).toBe('https://www.noradsanta.org/en/');
    for (const url of ['https://x.woudc.org/', 'https://evil.noradsanta.org/']) {
      expect(() => normalizeFetchUrl(url), url).toThrow(/only Government of Canada sites/);
    }
  });

  // agenticBase.js has the model load scenario files from this repo on GitHub.
  it("allows this repo's raw GitHub files, and nothing else on that host", () => {
    const scenario = 'https://raw.githubusercontent.com/cds-snc/ai-answers/main/agents/prompts/scenarios/x.md';
    expect(normalizeFetchUrl(scenario)).toBe(scenario);
    for (const url of [
      'https://raw.githubusercontent.com/attacker/repo/main/x.md',
      'https://raw.githubusercontent.com/cds-snc/other-repo/main/x.md',
      'https://raw.githubusercontent.com/cds-snc/ai-answers-fork/main/x.md',
      // PR heads and fork commits are served under the repo path but are
      // controlled by whoever opened the PR.
      'https://raw.githubusercontent.com/cds-snc/ai-answers/refs/pull/9999/head/evil.md',
      'https://raw.githubusercontent.com/cds-snc/ai-answers/0123456789abcdef0123456789abcdef01234567/evil.md',
      'https://raw.githubusercontent.com/cds-snc/ai-answers/main/../refs/pull/1/head/evil.md',
      // Encoded separators the parser leaves alone, in case GitHub decodes them.
      'https://raw.githubusercontent.com/cds-snc/ai-answers/main/..%2F..%2Frefs/pull/1/head/evil.md',
      'https://raw.githubusercontent.com/cds-snc/ai-answers/main/%2e%2e/refs/pull/1/head/evil.md',
      'https://raw.githubusercontent.com/cds-snc/ai-answers/main/..%5C..%5Crefs/pull/1/head/evil.md',
    ]) {
      expect(() => normalizeFetchUrl(url), url).toThrow(/only Government of Canada sites/);
    }
  });

  it('names the field in the error message', () => {
    expect(() => normalizeFetchUrl('', 'citationUrl')).toThrow(/Invalid citationUrl/);
  });
});
