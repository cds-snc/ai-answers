import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Validates a URL before making an HTTP request to prevent SSRF attacks.
 * Blocks private/reserved IPs, non-HTTP protocols, and resolves DNS
 * to catch DNS rebinding (e.g. a domain pointing to 127.0.0.1).
 */

const BLOCKED_IPV4_RANGES = [
  /^127\./,                          // Loopback
  /^10\./,                           // Private Class A
  /^172\.(1[6-9]|2\d|3[01])\./,     // Private Class B
  /^192\.168\./,                     // Private Class C
  /^169\.254\./,                     // Link-local / cloud metadata
  /^0\./,                            // "This" network
  /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./, // Shared address space (CGN)
  /^192\.0\.0\./,                    // IETF protocol assignments
  /^192\.0\.2\./,                    // TEST-NET-1
  /^198\.51\.100\./,                 // TEST-NET-2
  /^203\.0\.113\./,                  // TEST-NET-3
  /^198\.1[89]\./,                   // Benchmarking
  /^240\./,                          // Reserved (Class E)
  /^255\.255\.255\.255$/,            // Broadcast
];

const BLOCKED_IPV6_RANGES = [
  /^::1$/,                           // Loopback
  /^fe80:/i,                         // Link-local
  /^fc00:/i,                         // Unique local
  /^fd[0-9a-f]{2}:/i,               // Unique local
];

/**
 * Normalize an IP and extract the inner IPv4 if it's an IPv4-mapped IPv6 address.
 * e.g. "::ffff:127.0.0.1" → "127.0.0.1"
 */
function normalizeIp(ip) {
  const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mapped) return mapped[1];
  return ip;
}

export function isPrivateIp(ip) {
  const normalized = normalizeIp(ip);
  // After normalization, check if it's IPv4
  if (isIP(normalized) === 4) {
    return BLOCKED_IPV4_RANGES.some(range => range.test(normalized));
  }
  // IPv6
  return BLOCKED_IPV6_RANGES.some(range => range.test(normalized));
}

export async function validateUrlForSsrf(url) {
  // Must be a string
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('URL must be a non-empty string');
  }

  // Parse and enforce http(s) only
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked protocol "${parsed.protocol}" — only http: and https: are allowed`);
  }

  // Block localhost hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === 'ip6-localhost' || hostname === 'ip6-loopback') {
    throw new Error(`Blocked request to localhost`);
  }

  // If hostname is an IP literal, check it directly using net.isIP()
  const ipVersion = isIP(hostname);
  if (ipVersion) {
    if (isPrivateIp(hostname)) {
      throw new Error(`Blocked request to private/reserved IP address`);
    }
    return; // IP is safe
  }

  // Resolve DNS and check ALL resolved addresses
  try {
    const addresses = await lookup(hostname, { all: true });
    for (const { address } of addresses) {
      if (isPrivateIp(address)) {
        throw new Error(`Blocked request — hostname resolves to a private/reserved IP address`);
      }
    }
  } catch (err) {
    if (err.message.startsWith('Blocked request')) throw err;
    // DNS resolution failure — let the actual request handle it
  }
}

/**
 * Axios beforeRedirect hook that validates each redirect target against SSRF.
 */
export function ssrfBeforeRedirect(options) {
  const redirectUrl = typeof options === 'string' ? options : (options.href || options.url);
  if (!redirectUrl) return;
  let parsed;
  try {
    parsed = new URL(redirectUrl);
  } catch {
    throw new Error(`Blocked redirect to invalid URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked redirect to non-HTTP protocol "${parsed.protocol}"`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === 'ip6-localhost' || hostname === 'ip6-loopback') {
    throw new Error(`Blocked redirect to localhost`);
  }
  const ipVersion = isIP(hostname);
  if (ipVersion && isPrivateIp(hostname)) {
    throw new Error(`Blocked redirect to private/reserved IP address`);
  }
}
