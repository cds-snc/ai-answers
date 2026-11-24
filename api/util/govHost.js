// Is a URL on a Government of Canada host?
//
// Allowed: canada.ca, gc.ca and any subdomain of either, plus the host of any
// department/agency URL in departments_EN.js / departments_FR.js (and its
// subdomains) — that list is where GC organisations on their own domains
// (rcmp.ca, elections.ca, bankofcanada.ca, ...) are recorded. Plus
// EXTRA_GC_HOSTS below. Department hosts the GC doesn't control
// (NON_GC_DEPARTMENT_HOSTS) get no subdomains, and shared vendor hosts are
// limited to the department's own paths.
//
// Matching is on the parsed hostname, by exact match or dot-boundary suffix,
// never by substring: `canada.ca.attacker.example` and `evilcanada.ca` must
// both fail.
//
// Before changing what's allowed, run scripts/check-allowlist-urls.js on recent
// batch/chat-log exports to see which real citations and fetches would change.
import { departments_EN } from '../../agents/prompts/scenarios/departments_EN.js';
import { departments_FR } from '../../agents/prompts/scenarios/departments_FR.js';
import { parseHttpUrl } from './parseHttpUrl.js';

const GC_ROOT_DOMAINS = ['canada.ca', 'gc.ca'];

// GC services hosted on a third-party domain by an institution that is
// already in the department list, so they can't be added there as their own
// entry. Matched exactly, never by subdomain: the parent domain is shared
// hosting that serves other organisations too.
const EXTRA_GC_HOSTS = new Set([
  'bac-lac.on.worldcat.org', // LAC's Aurora catalogue (bac-lac-scenarios.js)
]);

// Department-list hosts the GC doesn't control, so they get no subdomain
// wildcard: whoever runs the domain can create any subdomain under it.
//  - 'host': that host only, with or without www.
//  - 'pinned': that exact host, and only under the listed paths. The host is a
//    vendor's shared hosting, and its other paths are other customers' content.
// A new department entry on a domain the GC doesn't control belongs here.
// scripts/extract_domains.js reads this too, so the search engine site list
// gets the same limits.
export const NON_GC_DEPARTMENT_HOSTS = new Map([
  // GC Core Subject Thesaurus (EN /cst/, FR /tsb/) on MultiTes's hosting.
  ['canada.multites.net', { match: 'pinned', paths: ['/cst/', '/tsb/'] }],
  // World Ozone and Ultraviolet Radiation Data Centre: WMO centre run by ECCC.
  ['woudc.org', { match: 'host' }],
  // NORAD Santa tracker: binational NORAD, not a GC domain.
  ['noradsanta.org', { match: 'host' }],
]);

function stripWww(host) {
  return host.startsWith('www.') ? host.slice(4) : host;
}

// Lowercase and drop a trailing root dot ("www.canada.ca.").
function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/\.$/, '');
}

function buildDepartmentHosts() {
  const hosts = new Set();
  for (const dept of [...departments_EN, ...departments_FR]) {
    try {
      const host = stripWww(new URL(dept.url).hostname.toLowerCase());
      if (!NON_GC_DEPARTMENT_HOSTS.has(host)) hosts.add(host);
    } catch {
      // A malformed entry in the list just contributes nothing.
    }
  }
  return hosts;
}

const DEPARTMENT_HOSTS = buildDepartmentHosts();

function matchesDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

// Host-only check. A path-pinned host fails here: its host alone doesn't make
// a URL GC content. Use isGovernmentUrl or isGovernmentLocation for those.
export function isGovernmentHost(hostname) {
  if (typeof hostname !== 'string' || hostname === '') return false;
  const host = normalizeHost(hostname);
  if (GC_ROOT_DOMAINS.some((d) => matchesDomain(host, d))) return true;
  if (EXTRA_GC_HOSTS.has(host)) return true;
  const bare = stripWww(host);
  if (NON_GC_DEPARTMENT_HOSTS.get(bare)?.match === 'host') return true;
  for (const d of DEPARTMENT_HOSTS) {
    if (matchesDomain(bare, d)) return true;
  }
  return false;
}

// Encoded '/', '\' or '.' could let a server that decodes them climb out of
// a pinned path after the prefix check has passed. Use on every path-pinned
// check (also the raw GitHub pin in normalizeFetchUrl.js).
const ENCODED_PATH_SEPARATOR = /%2f|%5c|%2e/i;

export function hasEncodedPathSeparator(pathname) {
  return ENCODED_PATH_SEPARATOR.test(pathname);
}

// Host and path check, for a parsed URL (WHATWG URL). Allows everything
// isGovernmentHost does, plus a path-pinned host under one of its paths.
export function isGovernmentLocation(parsed) {
  if (isGovernmentHost(parsed.hostname)) return true;
  const entry = NON_GC_DEPARTMENT_HOSTS.get(normalizeHost(parsed.hostname));
  if (entry?.match !== 'pinned') return false;
  if (hasEncodedPathSeparator(parsed.pathname)) return false;
  return entry.paths.some((p) => parsed.pathname.startsWith(p));
}

// True only for an absolute http(s) URL with no credentials (see
// parseHttpUrl) that passes isGovernmentLocation.
export function isGovernmentUrl(url) {
  const parsed = parseHttpUrl(url);
  return parsed !== null && isGovernmentLocation(parsed);
}
