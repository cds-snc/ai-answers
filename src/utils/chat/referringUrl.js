import gcHosts from '../../config/gcHosts.json';
import { createGovernmentMatcher } from '../gcHostMatch.js';
import { parseHttpUrl } from '../parseHttpUrl.js';

// Same value as the server's MAX_REFERRING_URL_LENGTH (api/util/referring-url.js);
// gcHostParity.test.js fails if they differ.
export const MAX_REFERRING_URL_LENGTH = 500;

const isGovernmentUrl = createGovernmentMatcher(gcHosts).isGovernmentUrl;

// Validation for ChatOptions.js's referring-URL field. Any well-formed
// absolute http(s) URL passes — not restricted to canada.ca/gc.ca, so
// admins/partners can still test department-guessing against other URLs.
export const isWellFormedHttpUrl = (value) => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// AIA-006: is this referring URL a Government of Canada page? The same rule
// the server uses to drop non-GC referrers from signed-out visitors
// (api/util/govHost.js), applied to the same lists via src/config/gcHosts.json.
// The chat page uses it only to decide what to SHOW a signed-out visitor; it
// still sends the value, and the server makes the real decision.
//
// The server also drops a URL that is still over MAX_REFERRING_URL_LENGTH once
// normalized. Normalizing removes the query string, and can only shorten the
// rest (decoding accents, dropping an anchor). So checking the length without
// the query means: if we show it, the server keeps it. A GC URL of 500+
// characters with many encoded accents might be hidden here yet kept there,
// which is the safe direction.
export function isGovernmentReferringUrl(url) {
  if (!isGovernmentUrl(url)) return false;
  const parsed = parseHttpUrl(url);
  parsed.search = '';
  return parsed.href.length <= MAX_REFERRING_URL_LENGTH;
}
