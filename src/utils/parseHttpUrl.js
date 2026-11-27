/**
 * Parse an untrusted string as an absolute http(s) URL.
 *
 * Shared first step for every URL that arrives from a client or a model:
 * the referring URL (AIA-006, api/util/referring-url.js), citation links
 * (AIA-007, api/util/govHost.js) and, next, model-chosen fetch URLs (AIA-010).
 * Lives in src/ so the chat page applies the same parse as the server
 * (src/utils/gcHostMatch.js); api/util/parseHttpUrl.js re-exports it.
 *
 * Returns null for anything that isn't a string, is blank, doesn't parse, isn't
 * http/https, or carries credentials. A user:password part is rejected because
 * it disguises the real host: https://www.canada.ca@attacker.example has host
 * attacker.example, but a person reading it sees canada.ca.
 *
 * @param {unknown} raw
 * @returns {URL|null}
 */
export function parseHttpUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  return parsed;
}
