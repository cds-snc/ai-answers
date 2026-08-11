import React from 'react';

// Shared live-region pattern for announcing the outcome of an async admin
// action (save/delete/import/export/test-run/upload results, autosave
// failures, etc.). Several admin tools had this outcome rendered as plain
// DOM text with no role at all, so screen-reader users got no indication
// anything happened. role="alert" (assertive) is for genuine failures;
// role="status" (polite) covers everything else — success, progress, and
// informational results — so it doesn't interrupt whatever the user is
// doing. See BatchPage.js's statusMessage state for the reference usage
// this was extracted from.
//
// TODO: this only standardizes the ARIA role/live-region behaviour so far.
// Every call site still passes its own ad-hoc inline `style` (blue text,
// red boxes with hand-picked hex colours, differing padding/border per
// page) instead of a shared success/error visual style. Worth folding a
// default `variant`-based style (or GC DS tokens) into this component so
// callers stop reinventing the colours, and dropping the `style` prop
// once that lands.
// forwardRef + tabIndex exist for callers that have to move focus to the
// message itself — e.g. SettingsPage's history count, which becomes the landing
// spot when the "Load more" button unmounts on the last page and would
// otherwise drop focus to <body>. Both are optional; existing callers are
// unaffected.
const StatusMessage = React.forwardRef((
  { message, isError = false, className, style, tag = 'p', tabIndex, children },
  ref
) => {
  if (!message && !children) return null;
  // children lets a caller render richer content (e.g. a follow-up bullet
  // list) than a single string — pass tag="div" alongside it, since block
  // content like a <ul> isn't valid inside the default <p>.
  const Tag = tag;
  return (
    <Tag
      ref={ref}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={className}
      style={style}
      tabIndex={tabIndex}
    >
      {children || message}
    </Tag>
  );
});

StatusMessage.displayName = 'StatusMessage';

export default StatusMessage;
