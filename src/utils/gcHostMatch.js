// The Government of Canada host rule, shared by the server and the chat page.
//
// Dependency-free: it takes the host lists as data. The server builds them from
// the department lists (api/util/govHost.js buildGcHostConfig). The chat page
// reads the same lists from src/config/gcHosts.json, which is generated from
// them, because importing the department lists would add ~13 KB gzipped to the
// public bundle. gcHostParity.test.js fails if the JSON is stale or the two
// checks disagree.
//
// Matching is on the parsed hostname, by exact match or dot-boundary suffix,
// never by substring: `canada.ca.attacker.example` and `evilcanada.ca` must
// both fail. See api/util/govHost.js for what each list means.
import { parseHttpUrl } from './parseHttpUrl.js';

function stripWww(host) {
  return host.startsWith('www.') ? host.slice(4) : host;
}

// Lowercase and drop a trailing root dot ("www.canada.ca.").
function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/\.$/, '');
}

function matchesDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

// Encoded '/', '\' or '.' could let a server that decodes them climb out of
// a pinned path after the prefix check has passed. Use on every path-pinned
// check (also the raw GitHub pin in normalizeFetchUrl.js).
const ENCODED_PATH_SEPARATOR = /%2f|%5c|%2e/i;

export function hasEncodedPathSeparator(pathname) {
  return ENCODED_PATH_SEPARATOR.test(pathname);
}

/**
 * @param {{
 *   rootDomains: string[],
 *   extraHosts: string[],
 *   departmentHosts: string[],
 *   nonGcDepartmentHosts: Record<string, { match: 'host' } | { match: 'pinned', paths: string[] }>,
 * }} config
 */
export function createGovernmentMatcher(config) {
  const { rootDomains, extraHosts, departmentHosts, nonGcDepartmentHosts } = config || {};
  if (![rootDomains, extraHosts, departmentHosts].every(Array.isArray)
    || typeof nonGcDepartmentHosts !== 'object' || nonGcDepartmentHosts === null) {
    throw new TypeError('createGovernmentMatcher: invalid host config');
  }
  const extra = new Set(extraHosts);
  // A Map, so a hostname like "constructor" can't hit an Object prototype key.
  const nonGc = new Map(Object.entries(nonGcDepartmentHosts));

  // Host-only check. A path-pinned host fails here: its host alone doesn't
  // make a URL GC content. Use isGovernmentUrl or isGovernmentLocation for those.
  function isGovernmentHost(hostname) {
    if (typeof hostname !== 'string' || hostname === '') return false;
    const host = normalizeHost(hostname);
    if (rootDomains.some((d) => matchesDomain(host, d))) return true;
    if (extra.has(host)) return true;
    const bare = stripWww(host);
    if (nonGc.get(bare)?.match === 'host') return true;
    return departmentHosts.some((d) => matchesDomain(bare, d));
  }

  // Host and path check, for a parsed URL (WHATWG URL). Allows everything
  // isGovernmentHost does, plus a path-pinned host under one of its paths.
  function isGovernmentLocation(parsed) {
    if (isGovernmentHost(parsed.hostname)) return true;
    const entry = nonGc.get(normalizeHost(parsed.hostname));
    if (entry?.match !== 'pinned') return false;
    if (hasEncodedPathSeparator(parsed.pathname)) return false;
    return entry.paths.some((p) => parsed.pathname.startsWith(p));
  }

  // True only for an absolute http(s) URL with no credentials (see
  // parseHttpUrl) that passes isGovernmentLocation.
  function isGovernmentUrl(url) {
    const parsed = parseHttpUrl(url);
    return parsed !== null && isGovernmentLocation(parsed);
  }

  return { isGovernmentHost, isGovernmentLocation, isGovernmentUrl };
}
