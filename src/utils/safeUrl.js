// Defence-in-depth for URLs placed into an <a href>. React does not sanitize
// href values, so a `javascript:` or `data:` scheme reaching an href executes
// on click.
//
// Keep this as a backstop. Upstream, UrlValidationService.validateUrlFormatting
// (via GraphWorkflowHelper's verifyCitation) only lets absolute http(s) URLs on
// Government of Canada hosts through (api/util/govHost.js, AIA-007), but this
// helper must not rely on that: it is the last gate before the href.
//
// Returns the original URL when it is an absolute http(s) link or a same-origin
// relative path, otherwise returns '' so the href is inert.
// Strip leading/trailing C0 control characters and spaces (U+0000–U+0020),
// as the URL parser does. Done by char code to keep control characters out of
// a regex literal (no-control-regex).
function trimControlAndSpace(s) {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) start++;
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--;
  return s.slice(start, end);
}

export function safeHttpHref(url) {
  if (typeof url !== 'string') return '';
  // Check the URL the way the browser will read it: the URL parser removes
  // every tab/newline/CR anywhere in the string and strips leading/trailing
  // control characters and spaces. Without this, "java\tscript:" or "/\t/host"
  // slip past the checks below and still navigate.
  const trimmed = trimControlAndSpace(url.replace(/[\t\n\r]/g, ''));
  if (trimmed === '') return '';

  // Protocol-relative ("//host/path") is NOT same-origin: it goes to whatever
  // host follows the slashes, with no scheme for the check below to see.
  // Browsers treat "\" like "/" here, so "/\host" and "\\host" are the same
  // thing. Reject all of them.
  if (/^[/\\]{2}/.test(trimmed)) return '';

  // A single leading "/" is a root-relative path on the page's own origin.
  if (trimmed.startsWith('/')) return url;

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
