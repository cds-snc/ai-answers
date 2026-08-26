// Normalize a model-provided URL before making an outbound request to it.
//
// The agent routinely emits `http://` URLs for sites whose live content is
// HTTPS-only — inspection.canada.ca is the recurring case, since its pages
// migrated from the legacy inspection.gc.ca domain and the plain-HTTP form is
// what the model reaches for. Every Government of Canada site requires HTTPS
// and redirects port 80, so on a laptop the mistake is invisible: the redirect
// is followed in milliseconds and the page loads.
//
// In the deployed VPC it is not invisible. The network ACL allows outbound 443
// only (terragrunt/aws/network/vpc.tf), and a NACL denial *silently drops* the
// packet rather than refusing it — no RST, no ICMP. The SYN vanishes and the
// request hangs until the client's own timeout fires. The symptom is a fetch
// that always fails at exactly the timeout value, which reads as a slow or
// flaky site rather than an unsent request. Upgrading the scheme here is what
// stops that, and it is the right normalization regardless: it drops a
// redirect round trip and keeps the request off cleartext HTTP.
//
// Fail-fast by design. A URL that cannot be requested at all (blank, garbled,
// or a non-http scheme such as javascript:/data:/file:) throws here rather
// than being handed to axios, so the caller surfaces a clear message instead
// of a network-shaped error. This is the outbound-request counterpart to
// src/utils/safeUrl.js, which gates schemes for rendering an <a href> and
// returns '' instead of throwing.
//
// Only the scheme is rewritten. The rest of the URL is returned byte for byte
// so that already-valid URLs are never re-encoded or given a trailing slash by
// a WHATWG URL round trip.
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
