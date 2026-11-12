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
 * - The anchor is kept: GC section anchors (#eligibility) are useful context — unless
 *   it contains `=`, `&` or `?`, which means it is carrying data, not naming a section.
 * - Any host is accepted: admins/partners test department matching against non-GC
 *   URLs (see src/utils/chat/referringUrl.js).
 *
 * Normalize once at each entry point and reuse the result — later consumers (e.g. a
 * portal/host match) should rely on this value rather than re-parsing the raw input.
 */

// The longest canada.ca/gc.ca page URL in our content is ~275 characters; 500 leaves
// room for long slugs and percent-encoded accents.
export const MAX_REFERRING_URL_LENGTH = 500;

// An anchor with `=`, `&` or `?` (raw or percent-encoded) is carrying data, not naming a
// section — e.g. hash-routed apps (`#/search?q=…`) put search terms and form values
// there. Drop it like the query string.
const DATA_IN_ANCHOR = /[=&?]|%(?:3D|26|3F)/i;

// Whitespace (incl. U+2028 line separator), control and format characters (incl.
// bidi overrides) stay percent-encoded even when non-ASCII.
const UNSAFE_DECODED = /[\p{White_Space}\p{C}]/u;

/**
 * The URL parser percent-encodes non-ASCII, turning French paths like
 * `admissibilité.html` into `admissibilit%C3%A9.html` — harder for the model to read
 * and different from what dashboard filters match on. Decode only runs of non-ASCII
 * UTF-8 bytes (%80–%FF): they can never decode to `<`, `>`, quotes or ASCII
 * whitespace, so the tag-breakout protection is unaffected.
 */
function decodeReadableNonAscii(href) {
  return href.replace(/(?:%[89A-F][0-9A-F])+/gi, (seq) => {
    try {
      const decoded = decodeURIComponent(seq);
      return UNSAFE_DECODED.test(decoded) ? seq : decoded;
    } catch {
      return seq; // malformed UTF-8 — leave it encoded
    }
  });
}

/**
 * @param {unknown} raw
 * @returns {string} the normalized URL, or '' when the value is absent or unusable
 */
export function normalizeReferringUrl(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  if (parsed.username || parsed.password) return '';

  parsed.search = '';
  if (DATA_IN_ANCHOR.test(parsed.hash)) parsed.hash = '';
  const href = decodeReadableNonAscii(parsed.href);
  // Drop rather than truncate: a cut-off URL could point at a different page.
  return href.length <= MAX_REFERRING_URL_LENGTH ? href : '';
}
