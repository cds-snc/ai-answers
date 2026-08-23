// Escapes a value for safe interpolation into a hand-built HTML string.
// DataTables `render` functions (and other hand-rolled markup builders)
// return raw HTML rather than JSX, so nothing there gets React's automatic
// escaping - anything dynamic/translated needs to go through this first.
//
// Single shared copy - reviewLink.js and labelPill.js both re-export this
// rather than keeping their own, so there's exactly one place that owns
// the escaping rules.
export const escapeHtml = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};
