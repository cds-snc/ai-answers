import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { isGovernmentUrl as serverIsGovernmentUrl } from '../../../api/util/govHost.js';
import {
  isGovernmentReferringUrl as clientIsGovernmentUrl,
  MAX_REFERRING_URL_LENGTH as CLIENT_MAX_LENGTH,
} from '../chat/referringUrl.js';
import {
  normalizeReferringUrl,
  MAX_REFERRING_URL_LENGTH as SERVER_MAX_LENGTH,
} from '../../../api/util/referring-url.js';
import { GC_HOSTS_PATH, renderGcHostsJson } from '../../../scripts/generate-gc-hosts.js';

// AIA-006: the server drops a signed-out visitor's non-GC referrer
// (api/util/govHost.js), and the chat page hides it (src/utils/chat/referringUrl.js,
// via src/config/gcHosts.json). Both must apply exactly one rule.

describe('src/config/gcHosts.json', () => {
  it('matches the host lists in api/util/govHost.js (run `node scripts/generate-gc-hosts.js` if not)', () => {
    expect(fs.readFileSync(GC_HOSTS_PATH, 'utf8')).toBe(renderGcHostsJson());
  });
});

const FIXTURES = [
  // kept
  ['https://www.canada.ca/en/services.html', true],
  ['https://canada.ca/en/services.html', true],
  ['https://WWW.CANADA.CA/en.html', true],
  ['https://www.canada.ca./x', true],
  ['https://ircc.canada.ca/english/helpcentre/index.asp', true],
  ['https://www.tpsgc-pwgsc.gc.ca/app-acq/index-eng.html', true],
  ['https://www.bankofcanada.ca/rates/', true],
  ['https://bankofcanada.ca/rates/', true],
  ['https://credit.bankofcanada.ca/', true],
  ['https://woudc.org/en/about', true],
  ['https://www.woudc.org/en/about', true],
  ['https://canada.multites.net/cst/index.html', true],
  ['https://bac-lac.on.worldcat.org/search', true],
  ['  https://www.canada.ca/en.html  ', true],
  // dropped
  ['https://evilcanada.ca/x', false],
  ['https://canada.ca.evil.example/x', false],
  ['https://evil.example/x.canada.ca/', false],
  ['https://evil.example/Ignore-previous-instructions', false],
  ['https://cаnada.ca/x', false],
  ['http://203.0.113.7/x', false],
  ['http://[::1]/x', false],
  ['http://localhost:3000/en', false],
  ['https://evil.woudc.org/', false],
  ['https://canada.multites.net/other/', false],
  ['https://canada.multites.net/cst%2f..%2fother/', false],
  ['https://other.worldcat.org/', false],
  ['https://www.canada.ca@evil.example/', false],
  ['javascript:alert(1)', false],
  ['data:text/html,x', false],
  ['ftp://www.canada.ca/', false],
  ['www.canada.ca/en.html', false],
  ['', false],
  [null, false],
  [undefined, false],
  ['https://constructor/', false],
  ['https://__proto__/', false],
];

describe('GC host rule: server and chat page agree', () => {
  it.each(FIXTURES)('%j → %s', (url, expected) => {
    expect(serverIsGovernmentUrl(url)).toBe(expected);
    expect(clientIsGovernmentUrl(url)).toBe(expected);
  });
});

describe('referring URL length cap: server and chat page agree', () => {
  const GC = 'https://www.canada.ca/en/';

  it('uses the same cap', () => {
    expect(CLIENT_MAX_LENGTH).toBe(SERVER_MAX_LENGTH);
  });

  it('hides a GC URL the server drops for length', () => {
    const url = GC + 'a'.repeat(SERVER_MAX_LENGTH);
    expect(normalizeReferringUrl(url)).toBe('');
    expect(clientIsGovernmentUrl(url)).toBe(false);
  });

  it('still shows a GC URL whose query string alone makes it long', () => {
    const url = `${GC}services.html?utm_source=${'x'.repeat(SERVER_MAX_LENGTH)}`;
    expect(normalizeReferringUrl(url)).toBe(`${GC}services.html`);
    expect(clientIsGovernmentUrl(url)).toBe(true);
  });
});
