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
 * - Any host is accepted: admins/partners test department matching against non-GC
 *   URLs (see src/utils/chat/referringUrl.js).
 *
 * Normalize once at each entry point and reuse the result — later consumers (e.g. a
 * portal/host match) should rely on this value rather than re-parsing the raw input.
 */

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
