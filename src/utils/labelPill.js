import { escapeHtml } from './htmlEscape.js';

// Re-exported so callers of labelPill.js (a pure CSS/presentation helper,
// not a link builder) don't need to reach into htmlEscape.js separately -
// see that file for the actual implementation, shared with reviewLink.js.
export { escapeHtml };

// Builds one `.label` pill (admin.css's shared colour-tier pills - see its
// own comments for which classes map to which colour) as a raw HTML string,
// for DataTables `render` functions. Purely presentational - not a link or
// any other interactive element, so this has no dependency beyond the CSS
// class itself. `className` is the tier-selecting class (e.g. 'processed',
// 'failed', 'correct') - admin.css chains it onto the shared colour rule it
// belongs to rather than giving every caller its own hex values.
export const buildLabelPillHtml = (className, label) =>
  `<span class="label ${escapeHtml(className)}">${escapeHtml(label)}</span>`;
