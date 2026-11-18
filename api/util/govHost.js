// Is a URL on a Government of Canada host?
//
// Allowed: canada.ca, gc.ca and any subdomain of either, plus the host of any
// department/agency URL in departments_EN.js / departments_FR.js (and its
// subdomains) — that list is where GC organisations on their own domains
// (rcmp.ca, elections.ca, bankofcanada.ca, ...) are recorded.
//
// Matching is on the parsed hostname, by exact match or dot-boundary suffix,
// never by substring: `canada.ca.attacker.example` and `evilcanada.ca` must
// both fail.
import { departments_EN } from '../../agents/prompts/scenarios/departments_EN.js';
import { departments_FR } from '../../agents/prompts/scenarios/departments_FR.js';

const GC_ROOT_DOMAINS = ['canada.ca', 'gc.ca'];

function stripWww(host) {
  return host.startsWith('www.') ? host.slice(4) : host;
}

function buildDepartmentHosts() {
  const hosts = new Set();
  for (const dept of [...departments_EN, ...departments_FR]) {
    try {
      hosts.add(stripWww(new URL(dept.url).hostname.toLowerCase()));
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

export function isGovernmentHost(hostname) {
  if (typeof hostname !== 'string' || hostname === '') return false;
  // Lowercase and drop a trailing root dot ("www.canada.ca.").
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (GC_ROOT_DOMAINS.some((d) => matchesDomain(host, d))) return true;
  const bare = stripWww(host);
  for (const d of DEPARTMENT_HOSTS) {
    if (matchesDomain(bare, d)) return true;
  }
  return false;
}

// True only for an absolute http(s) URL whose host passes isGovernmentHost.
// Relative and protocol-relative URLs, other schemes, and URLs carrying
// credentials (https://canada.ca@attacker.example parses with host
// attacker.example, but a user reading it sees canada.ca) are rejected.
export function isGovernmentUrl(url) {
  if (typeof url !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  if (parsed.username || parsed.password) return false;
  return isGovernmentHost(parsed.hostname);
}
