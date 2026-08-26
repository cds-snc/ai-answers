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

  if (parsed.protocol === 'https:') {
    return trimmed;
  }

  if (parsed.protocol === 'http:') {
    return trimmed.replace(/^http:/i, 'https:');
  }

  throw new Error(
    `Invalid ${fieldName}: unsupported scheme "${parsed.protocol}" (${trimmed})`
  );
}

export default normalizeFetchUrl;
