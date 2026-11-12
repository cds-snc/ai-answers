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
 * - The anchor is kept: GC section anchors (#eligibility) are useful context.
 * - Any host is accepted: admins/partners test department matching against non-GC
 *   URLs (see src/utils/chat/referringUrl.js).
 *
 * Normalize once at each entry point and reuse the result — later consumers (e.g. a
 * portal/host match) should rely on this value rather than re-parsing the raw input.
 */

// The longest canada.ca/gc.ca page URL in our content is ~275 characters; 500 leaves
// room for long slugs and percent-encoded accents.
export const MAX_REFERRING_URL_LENGTH = 500;

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
  const href = parsed.href;
  // Drop rather than truncate: a cut-off URL could point at a different page.
  return href.length <= MAX_REFERRING_URL_LENGTH ? href : '';
}
