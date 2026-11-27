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
//
// This file defines the lists. The matching itself lives in
// src/utils/gcHostMatch.js so the chat page applies the same rule (AIA-006
// follow-up). After changing a list here or a department URL, run
// `node scripts/generate-gc-hosts.js` to refresh src/config/gcHosts.json;
// gcHostParity.test.js fails until you do.
import { departments_EN } from '../../agents/prompts/scenarios/departments_EN.js';
import { departments_FR } from '../../agents/prompts/scenarios/departments_FR.js';
import { createGovernmentMatcher, hasEncodedPathSeparator } from '../../src/utils/gcHostMatch.js';

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

function buildDepartmentHosts() {
  const hosts = new Set();
  for (const dept of [...departments_EN, ...departments_FR]) {
    try {
      const host = new URL(dept.url).hostname.toLowerCase().replace(/^www\./, '');
      if (!NON_GC_DEPARTMENT_HOSTS.has(host)) hosts.add(host);
    } catch {
      // A malformed entry in the list just contributes nothing.
    }
  }
  return hosts;
}

// The host lists as plain data, for src/utils/gcHostMatch.js. Sorted so the
// generated src/config/gcHosts.json is stable.
export function buildGcHostConfig() {
  return {
    rootDomains: [...GC_ROOT_DOMAINS],
    extraHosts: [...EXTRA_GC_HOSTS].sort(),
    departmentHosts: [...buildDepartmentHosts()].sort(),
    nonGcDepartmentHosts: Object.fromEntries(
      [...NON_GC_DEPARTMENT_HOSTS].sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

const matcher = createGovernmentMatcher(buildGcHostConfig());

// Host-only check. A path-pinned host fails here: its host alone doesn't make
// a URL GC content. Use isGovernmentUrl or isGovernmentLocation for those.
export const { isGovernmentHost } = matcher;

// Host and path check, for a parsed URL (WHATWG URL). Allows everything
// isGovernmentHost does, plus a path-pinned host under one of its paths.
export const { isGovernmentLocation } = matcher;

// True only for an absolute http(s) URL with no credentials (see
// parseHttpUrl) that passes isGovernmentLocation.
export const { isGovernmentUrl } = matcher;

export { hasEncodedPathSeparator };
