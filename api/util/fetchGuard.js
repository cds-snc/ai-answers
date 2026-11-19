// Network-level guard for the model-driven fetch tools (AIA-010:
// downloadWebPage, checkUrl).
//
// normalizeFetchUrl.js checks the *first* URL's host against the allowlist.
// This file covers what that check can't see:
//
// - Where the host actually resolves. An allowed hostname can still point at
//   a private address (a misconfigured or hijacked DNS record, or DNS rebinding
//   between a pre-check and the connect). The check runs inside the agent's
//   DNS lookup, so it applies to the exact IP the socket connects to, on every
//   connection, including each redirect hop.
// - Where a redirect goes. Every hop is re-checked against the same allowlist
//   and must stay on https (beforeRedirect).
import { readFileSync } from 'fs';
import { Agent as HttpAgent } from 'http';
import { Agent } from 'https';
import { lookup as dnsLookup } from 'dns';
import { BlockList, isIP } from 'net';
import { rootCertificates } from 'tls';
import { isAllowedFetchUrl } from './normalizeFetchUrl.js';

// TLS certificates are verified. Several GC sites on Shared Services Canada
// certificates (e.g. clo-ocol.gc.ca, housing-infrastructure.canada.ca) don't
// send their intermediate, "Entrust OV TLS Issuing RSA CA 2". Browsers fetch a
// missing intermediate themselves; Node doesn't, so without it those pages
// fail to verify. It is public (from the certificate's AIA URL,
// crt.sectigo.com) and chains to Sectigo Public Server Authentication Root R46
// in Node's root store. Expires 2027-12-10: fetchGuard.test.js fails 90 days
// ahead, so it can be replaced before fetches start failing.
//
// Scoped to this agent rather than NODE_EXTRA_CA_CERTS, so no other outbound
// connection trusts anything extra.
export const ENTRUST_OV_CA2_PEM = readFileSync(
  new URL('./certs/entrust-ov-tls-issuing-rsa-ca-2.pem', import.meta.url),
  'utf8'
);
const FETCH_CA = [...rootCertificates, ENTRUST_OV_CA2_PEM];

// Addresses a public GC page never resolves to: loopback, private, link-local
// (incl. the 169.254.169.254 metadata endpoint), CGN, multicast, reserved and
// documentation ranges.
const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['192.88.99.0', 24],   // 6to4 relay anycast
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  BLOCKED.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 96],         // unspecified, loopback and IPv4-compatible (::a.b.c.d)
  ['64:ff9b::', 96],  // NAT64 (well-known): embeds an IPv4 address
  ['64:ff9b:1::', 48], // NAT64 (local use): can reach private IPv4
  ['2001::', 32],     // Teredo: embeds an IPv4 address
  ['2002::', 16],     // 6to4: embeds an IPv4 address
  ['fc00::', 7],      // unique local
  ['fe80::', 10],     // link-local
  ['ff00::', 8],      // multicast
  ['2001:db8::', 32], // documentation
]) {
  BLOCKED.addSubnet(net, prefix, 'ipv6');
}

// IPv4-mapped IPv6 (::ffff:a.b.c.d) is blocked outright: a public site has no
// reason to publish one, and it is the usual way to dress up a private IPv4.
// Checked by hand, not as a BlockList subnet: BlockList applies a
// ::ffff:0:0/96 rule to plain IPv4 addresses too, which would block them all.
// The URL parser canonicalises the address first, so the expanded
// (0:0:0:0:0:ffff:…) and hex (::ffff:7f00:1) spellings are caught as well.
function isIpv4Mapped(address) {
  try {
    return new URL(`http://[${address}]`).hostname.startsWith('[::ffff:');
  } catch {
    return true;
  }
}

export function isBlockedAddress(address) {
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, 'ipv4');
  if (family === 6) return isIpv4Mapped(address) || BLOCKED.check(address, 'ipv6');
  return true; // not an IP at all: refuse rather than guess
}

function blockedError(hostname) {
  const err = new Error(`Blocked: ${hostname} resolves to a private or reserved address`);
  err.code = 'EBLOCKEDADDRESS';
  return err;
}

// Drop-in for dns.lookup. Resolves every address and refuses the connection
// if any of them is blocked, not just the one that would be used.
export function guardedLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else if (typeof options === 'number') {
    options = { family: options };
  }
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
      return callback(blockedError(hostname));
    }
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

// follow-redirects calls this before each hop with the next request's options
// (and uses them for that hop, so changes here take effect); throwing aborts.
//
// An http hop is upgraded to https, like normalizeFetchUrl does for the first
// URL. Some GC sites redirect https -> http -> https (veterans.gc.ca, pm.gc.ca),
// and in the VPC an http hop never connects (443-only egress).
export function guardRedirect(options) {
  if (options.protocol === 'http:') {
    options.protocol = 'https:';
    if (String(options.port) === '80') delete options.port;
  }
  const port = options.port ? `:${options.port}` : '';
  const next = `${options.protocol}//${options.hostname}${port}${options.path || ''}`;
  if (options.protocol !== 'https:') {
    throw new Error(`Blocked redirect to non-https URL: ${next}`);
  }
  let parsed;
  try {
    parsed = new URL(next);
  } catch {
    throw new Error(`Blocked redirect to an unparseable URL: ${next}`);
  }
  if (!isAllowedFetchUrl(parsed)) {
    throw new Error(`Blocked redirect to a non-Government of Canada URL: ${next}`);
  }
}

// axios request options for a model-chosen URL: guarded agents + redirect hook.
//
// httpAgent is guarded too even though normalizeFetchUrl upgrades http to
// https: its header documents a shape ("ht\ttp://…") that slips past the
// upgrade, and that request must not skip the address check.
//
export function guardedRequestOptions() {
  return {
    httpAgent: new HttpAgent({ lookup: guardedLookup }),
    httpsAgent: new Agent({ ca: FETCH_CA, lookup: guardedLookup }),
    beforeRedirect: guardRedirect,
  };
}
