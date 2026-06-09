// Defence-in-depth for URLs placed into an <a href>. React does not sanitize
// href values, so a `javascript:` or `data:` scheme reaching an href executes
// on click. Citation URLs are normally validated upstream (UrlValidationService
// → www.canada.ca), but the render falls back to raw model-provided URLs, so we
// gate the scheme here as a last line of defence.
//
// Returns the original URL when it is an http(s) (or protocol-relative/relative)
// link, otherwise returns '' so the href is inert.
export function safeHttpHref(url) {
  if (typeof url !== 'string' || url.trim() === '') return '';
  const trimmed = url.trim();

  // Protocol-relative ("//host/path") and root/relative paths are safe — they
  // can only ever resolve to the page's own http(s) origin.
  if (trimmed.startsWith('//') || trimmed.startsWith('/')) return url;

  // Reject any explicit scheme that isn't http/https (javascript:, data:,
  // vbscript:, file:, etc.). A scheme is letters/digits/+/-/. followed by ':'.
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    return scheme === 'http' || scheme === 'https' ? url : '';
  }

  // No scheme and not starting with '/': treat as a relative link (safe).
  return url;
}

export default safeHttpHref;
