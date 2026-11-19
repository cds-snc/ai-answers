import { isGovernmentHost } from './govHost.js';

// Normalize a model-provided URL before making an outbound request to it.
//
// The agent routinely emits `http://` URLs for GC sites that are HTTPS-only —
// inspection.canada.ca is the recurring case, since its pages migrated from the
// legacy inspection.gc.ca domain. Locally the mistake is invisible: the site's
// redirect to HTTPS is followed in milliseconds. In the deployed VPC it is not.
// The network ACL allows outbound 443 only (terragrunt/aws/network/vpc.tf), and
// a NACL denial *silently drops* the packet — no RST, no ICMP. The request
// hangs until the client's own timeout fires, so the symptom is a fetch that
// always fails at exactly the timeout value, reading as a flaky site rather
// than a request that never left.
//
// The upgrade is unconditional rather than allowlisted by host. That is a
// strict improvement in the VPC, where port 80 could never have succeeded, but
// it does change local dev, which has no such restriction: an http-only host
// that worked under `npm run dev` will now fail to connect. Accepted, since
// every URL this sees is expected to be a GC site.
//
// Fail-fast by design. A URL that cannot be requested at all (blank, garbled,
// or a non-http scheme such as javascript:/data:/file:) throws here rather
// than being handed to axios, so the caller surfaces a clear message instead
// of a network-shaped error. This is the outbound-request counterpart to
// src/utils/safeUrl.js, which gates schemes for rendering an <a href> and
// returns '' instead of throwing.
//
// Only the scheme is rewritten, so the returned string stays byte-identical to
// the input otherwise. This does not change what goes on the wire — axios
// re-parses through `new URL()` before dispatching either way — but the
// returned value also appears in tool output and error messages, where a
// silently re-encoded query or an added trailing slash would be confusing.

// Hosts the fetch tools may request (AIA-010): Government of Canada hosts
// (govHost.js — the same check citations get), plus this repo's own files on
// raw.githubusercontent.com, which agenticBase.js has the model load as
// scenario instruction files. Pinned to the main branch: GitHub also serves
// PR heads (refs/pull/N/head) and fork commits (bare SHAs) under the repo
// path, and anyone who opens a PR controls those. The model treats these files
// as instructions.
//
// Default ports only: no GC page is served on another port, and an open port
// choice lets a model probe services on an allowed host.
const SCENARIO_FILE_HOST = 'raw.githubusercontent.com';
const SCENARIO_FILE_PATH = '/cds-snc/ai-answers/main/';

export function isAllowedFetchUrl(parsed) {
  // The URL parser blanks a scheme's default port (https://x:443 → '').
  if (parsed.port !== '') return false;
  if (isGovernmentHost(parsed.hostname)) return true;
  return (
    parsed.hostname.toLowerCase() === SCENARIO_FILE_HOST &&
    parsed.pathname.startsWith(SCENARIO_FILE_PATH)
  );
}

export function normalizeFetchUrl(value, fieldName = 'url') {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${fieldName}: expected a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Invalid ${fieldName}: empty`);
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid ${fieldName}: not an absolute URL (${trimmed})`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(
      `Invalid ${fieldName}: unsupported scheme "${parsed.protocol}" (${trimmed})`
    );
  }

  // AIA-010: the URL is model-chosen, so without this the server would fetch
  // whatever host a prompt-injected model asked for, from inside the VPC.
  // Redirect hops and the resolved IP are checked in fetchGuard.js.
  if (!isAllowedFetchUrl(parsed)) {
    throw new Error(
      `Blocked ${fieldName}: only Government of Canada sites can be fetched (${parsed.hostname})`
    );
  }

  if (parsed.protocol === 'https:') {
    return trimmed;
  }

  // http: — rewritten from `trimmed`, not `parsed.href`, to stay byte-identical (see
  // above) — which means this line trusts `trimmed` to actually start with
  // "http:". It might not: `new URL()` above silently drops any ASCII tab/
  // CR/LF from the input before reading `protocol`, so a stray control
  // character landing inside the scheme (e.g. "ht\ttp://…") is classified
  // as http: above but defeats this regex, and the un-upgraded URL is
  // returned. That URL still reaches axios, which does the same silent
  // stripping and dispatches it as plain http — the exact VPC hang this
  // file exists to prevent. Known gap, accepted: this shape has not been
  // observed in practice, unlike bare `http://`, which is routine (see top
  // of file).
  return trimmed.replace(/^http:/i, 'https:');
}

export default normalizeFetchUrl;
