import http from 'http';
import axios from 'axios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  guardRedirect,
  guardedLookup,
  guardedRequestOptions,
  isBlockedAddress,
} from '../fetchGuard.js';

describe('isBlockedAddress', () => {
  it('blocks loopback, private, link-local/metadata and reserved IPv4', () => {
    for (const ip of [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '192.88.99.1',
      '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('blocks loopback, unique-local, link-local and IPv4-mapped IPv6', () => {
    for (const ip of [
      '::1', '::', 'fd00::1', 'fc00::1', 'fe80::1', '64:ff9b::a00:1',
      '64:ff9b:1::a00:1', '2002:a00:1::1', '2001:0:a00:1::1', '::7f00:1',
      '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:7f00:1',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  // Regression: a ::ffff:0:0/96 BlockList rule also matched every plain IPv4
  // address, which would have blocked every fetch.
  it('allows public addresses', () => {
    for (const ip of ['205.193.117.158', '8.8.8.8', '172.32.0.1', '2600:1f18::1']) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it('treats a non-IP value as blocked', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});

describe('guardedLookup', () => {
  it('refuses a hostname that resolves to loopback', async () => {
    const err = await new Promise((resolve) => guardedLookup('localhost', {}, (e) => resolve(e)));
    expect(err?.code).toBe('EBLOCKEDADDRESS');
  });
});

describe('guardRedirect', () => {
  const hop = (url) => {
    const u = new URL(url);
    return { protocol: u.protocol, hostname: u.hostname, path: u.pathname + u.search };
  };

  it('allows a hop to another Government of Canada host', () => {
    // inspection.gc.ca -> inspection.canada.ca is a real, routine redirect.
    expect(() => guardRedirect(hop('https://inspection.canada.ca/en'))).not.toThrow();
  });

  it('blocks a hop off the allowlist', () => {
    expect(() => guardRedirect(hop('https://attacker.example/x'))).toThrow(/non-Government of Canada/);
    expect(() => guardRedirect(hop('https://169.254.169.254/latest/meta-data'))).toThrow(/non-Government of Canada/);
  });

  it('blocks a non-default port, and names it in the error', () => {
    expect(() => guardRedirect({ protocol: 'https:', hostname: 'www.canada.ca', port: 8443, path: '/x' }))
      .toThrow(/www\.canada\.ca/);
    expect(() => guardRedirect({ protocol: 'http:', hostname: 'www.canada.ca', port: 8080, path: '/x' }))
      .toThrow(/https:\/\/www\.canada\.ca:8080\/x/);
  });

  // veterans.gc.ca and pm.gc.ca redirect https -> http -> https.
  it('upgrades an http hop to https instead of following it over http', () => {
    const options = { protocol: 'http:', hostname: 'www.veterans.gc.ca', port: 80, path: '/en' };
    expect(() => guardRedirect(options)).not.toThrow();
    expect(options.protocol).toBe('https:');
    expect(options.port).toBeUndefined();
  });

  it('refuses an https page that redirects to its own http form, instead of looping', () => {
    const options = { protocol: 'http:', hostname: 'www.canada.ca', path: '/en/x.html' };
    expect(() => guardRedirect(options, {}, { url: 'https://www.canada.ca/en/x.html' }))
      .toThrow(/its own http form/);
  });

  it('follows an upgraded hop that lands on a different URL', () => {
    // http://veterans.gc.ca/en came from https://veterans.gc.ca/en; the upgrade
    // goes to https://www.veterans.gc.ca/en, which is not where it started.
    const options = { protocol: 'http:', hostname: 'www.veterans.gc.ca', path: '/en' };
    expect(() => guardRedirect(options, {}, { url: 'https://veterans.gc.ca/en' })).not.toThrow();
  });

  it('blocks a non-https, non-http hop', () => {
    expect(() => guardRedirect({ protocol: 'ftp:', hostname: 'www.canada.ca', path: '/x' })).toThrow(/non-https/);
  });
});

// End to end through axios with local servers standing in for VPC-internal
// services: the report's demonstrated chain was a redirect into one.
describe('guardedRequestOptions with axios', () => {
  let target;
  let redirector;
  let targetPort;
  let redirectorPort;

  beforeAll(async () => {
    target = http.createServer((_req, res) => res.end('INTERNAL SECRET'));
    await new Promise((r) => target.listen(0, '127.0.0.1', r));
    targetPort = target.address().port;
    redirector = http.createServer((_req, res) => {
      res.writeHead(302, { Location: `https://127.0.0.1:${targetPort}/` });
      res.end();
    });
    await new Promise((r) => redirector.listen(0, '127.0.0.1', r));
    redirectorPort = redirector.address().port;
  });

  afterAll(() => {
    target.close();
    redirector.close();
  });

  it('refuses to connect to a hostname that resolves to a private address', async () => {
    await expect(
      axios.get(`http://localhost:${targetPort}/`, { ...guardedRequestOptions(), timeout: 3000 })
    ).rejects.toMatchObject({ code: 'EBLOCKEDADDRESS' });
  });

  it('refuses a redirect into an internal address', async () => {
    // First hop is an IP literal, so it skips DNS lookup; the redirect hook is
    // what has to stop the second hop.
    await expect(
      axios.get(`http://127.0.0.1:${redirectorPort}/`, { ...guardedRequestOptions(), timeout: 3000 })
    ).rejects.toThrow(/Blocked redirect/);
  });
});

describe('guardedRequestOptions', () => {
  it('turns off axios proxy handling, so the guarded agents are always used', () => {
    expect(guardedRequestOptions().proxy).toBe(false);
  });

  it('reuses the same agents across calls', () => {
    const a = guardedRequestOptions();
    const b = guardedRequestOptions();
    expect(a.httpsAgent).toBe(b.httpsAgent);
    expect(a.httpAgent).toBe(b.httpAgent);
  });

  // TLS verification is a separate decision from AIA-010; this pins the
  // tools' existing behaviour so a change to it is deliberate.
  it('keeps the existing TLS behaviour of the fetch tools', () => {
    expect(guardedRequestOptions().httpsAgent.options.rejectUnauthorized).toBe(false);
  });
});
