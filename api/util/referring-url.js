/**
 * Server-side validation for the client-supplied referring URL (AIA-006).
 *
 * `referringUrl` arrives from the client (anonymous public chat or an admin batch CSV)
 * and goes into LLM prompts (`<referring-url>` tag, query rewrite, program-action
 * classify), logs and the database. It skips the redaction guardrail, which only runs
 * on the question. Instead it must be a real http(s) URL, re-serialized by the URL
 * parser so that `<`, `>`, quotes and whitespace are percent-encoded and the value
 * cannot break out of its prompt tag.
 *
 * - The query string is dropped: it is where search terms and form values (possible
 *   PII) live. Prompts and department matching only use host and path.
 * - The anchor is kept only when it looks like a section name (#eligibility, #wb-cont,
 *   #critères): letters, digits, `_`, `-`, `.`, with no run of 6+ digits. Anything
 *   else (`#046454286`, `#/case/1`, `#jane.doe@example.com`, `#/search?q=…`) is
 *   carrying data and is dropped.
 * - normalizeReferringUrl accepts any host: admins/partners test department matching
 *   against non-GC URLs (see src/utils/chat/referringUrl.js). classifyReferringUrl with
 *   gcOnly (signed-out visitors) also drops non-GC hosts, keeping only the hostname so
 *   the partner dashboard can count where those visitors came from.
 *
 * Normalize once at each entry point and reuse the result — later consumers (e.g. a
 * portal/host match) should rely on this value rather than re-parsing the raw input.
 */

import { parseHttpUrl } from './parseHttpUrl.js';
import { isGovernmentLocation } from './govHost.js';

// The longest canada.ca/gc.ca page URL in our content is ~275 characters; 500 leaves
// room for long slugs and percent-encoded accents.
export const MAX_REFERRING_URL_LENGTH = 500;

// Section anchors (#eligibility, #critères) are useful context. Anything else —
// hash-routed apps (`#/case/046454286`, `#/search?q=…`), emails — is carrying data,
// so drop it like the query string. Tested after non-ASCII letters are decoded.
const SECTION_ANCHOR = /^[\p{L}\p{M}\p{N}_.-]+$/u;
// A run of 6+ digits looks like a SIN, case or file number, not a section name.
const ID_LIKE_DIGITS = /\p{N}{6}/u;

// Only letters, combining marks and digits are decoded back to readable form.
// Everything else non-ASCII stays percent-encoded: lookalike punctuation such as
// fullwidth ＜ ＞ (U+FF1C/FF1E) that a model could read as a tag, whitespace (incl.
// U+2028), and control/format characters (incl. bidi overrides).
const NOT_LETTER_OR_DIGIT = /[^\p{L}\p{M}\p{N}]/gu;

/**
 * The URL parser percent-encodes non-ASCII, turning French paths like
 * `admissibilité.html` into `admissibilit%C3%A9.html` — harder for the model to read
 * and different from what dashboard filters match on. Decode only runs of non-ASCII
 * UTF-8 bytes (%80–%FF), and within them re-encode anything that isn't a letter or
 * digit, so the tag-breakout protection is unaffected.
 */
function decodeReadableNonAscii(href) {
  return href.replace(/(?:%[89A-F][0-9A-F])+/gi, (seq) => {
    try {
      return decodeURIComponent(seq).replace(NOT_LETTER_OR_DIGIT, encodeURIComponent);
    } catch {
      return seq; // malformed UTF-8 — leave it encoded
    }
  });
}

// Longest valid DNS name.
const MAX_HOST_LENGTH = 253;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * The only form of a rejected referrer that is ever logged, stored or shown. Never the
 * URL: its path can carry injected text or PII. Takes the WHATWG hostname, which is
 * already lowercase, punycoded and has IPv4 in dotted-decimal form.
 *
 * - IP literals become 'ip-literal' and localhost becomes 'localhost', so no address
 *   is kept.
 * - One trailing dot and one leading `www.` are dropped, so www.example.com and
 *   example.com count as one source.
 * - No hashing: a hash of a guessable URL can be reversed.
 *
 * @param {string} hostname a WHATWG URL hostname
 * @returns {string}
 */
export function rejectedReferrerHost(hostname) {
  let host = String(hostname).toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') || IPV4.test(host)) return 'ip-literal';
  if (host === 'localhost' || host.endsWith('.localhost')) return 'localhost';
  if (host.startsWith('www.')) host = host.slice(4);
  return host.slice(0, MAX_HOST_LENGTH);
}

// Normalize an already-parsed URL. Mutates `parsed` (drops the query string).
function normalizeParsed(parsed) {
  parsed.search = '';
  let href = decodeReadableNonAscii(parsed.href);
  // The parser encodes any `#` in the path, so the first `#` starts the anchor.
  const hashAt = href.indexOf('#');
  const anchor = hashAt === -1 ? '' : href.slice(hashAt + 1);
  if (hashAt !== -1 && (!SECTION_ANCHOR.test(anchor) || ID_LIKE_DIGITS.test(anchor))) {
    href = href.slice(0, hashAt);
  }
  // Drop rather than truncate: a cut-off URL could point at a different page.
  return href.length <= MAX_REFERRING_URL_LENGTH ? href : '';
}

/**
 * @param {unknown} raw
 * @returns {string} the normalized URL, or '' when the value is absent or unusable
 */
export function normalizeReferringUrl(raw) {
  const parsed = parseHttpUrl(raw);
  return parsed ? normalizeParsed(parsed) : '';
}

/**
 * Normalize a referring URL and, with `gcOnly`, drop it unless it is on a Government
 * of Canada host (api/util/govHost.js). Parses once; the host check runs on the parsed
 * URL, before the query string is removed.
 *
 * A non-GC URL counts as 'not_gc' even when it is also too long, so every rejected
 * visitor is counted by host.
 *
 * @param {unknown} raw
 * @param {{ gcOnly: boolean }} options
 * @returns {{ url: string, droppedReason: null | 'invalid' | 'not_gc', host: string }}
 *   `url` is '' whenever droppedReason is set. `host` is set only for 'not_gc', and is
 *   the normalized hostname from rejectedReferrerHost.
 */
export function classifyReferringUrl(raw, { gcOnly }) {
  if (typeof gcOnly !== 'boolean') throw new TypeError('classifyReferringUrl: gcOnly must be a boolean');
  const blank = typeof raw !== 'string' || !raw.trim();
  const parsed = parseHttpUrl(raw);
  if (!parsed) return { url: '', droppedReason: blank ? null : 'invalid', host: '' };
  if (gcOnly && !isGovernmentLocation(parsed)) {
    return { url: '', droppedReason: 'not_gc', host: rejectedReferrerHost(parsed.hostname) };
  }
  const url = normalizeParsed(parsed);
  return { url, droppedReason: url ? null : 'invalid', host: '' };
}
