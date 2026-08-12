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
// `loading` is a distinct sub-type, not just isError=false: it marks an
// in-progress state (as opposed to a completed success/info/error result),
// so it gets its own className hook (`status-message--loading`) for a
// future spinner/animation instead of overloading `isError` or having each
// call site hand-roll its own loading markup. `id` is exposed so a loading
// or error message can be the target of another element's aria-describedby
// (e.g. a disabled button explaining why).
//
// TODO: this only standardizes the ARIA role/live-region behaviour so far —
// every call site still passes its own ad-hoc inline `style` (blue text,
// red boxes with hand-picked hex colours, differing padding/border per
// page) instead of a shared visual style. Give this component a `variant`
// prop and style each message type distinctly: success, info, warning,
// error, loading (or more as they come up). Reuse the GC DS red/green/blue
// -100/500/700 token triads `.dashboard-error` in admin.css already uses
// for its box, so callers stop reinventing the colours — then drop the
// `style` prop once call sites migrate. The `loading` variant currently has
// no spinner markup — add one (inline, alongside/replacing the text; not a
// popup/toast — no other part of the app uses that pattern, and it'd need
// its own focus/dismiss/stacking handling) with prefers-reduced-motion
// handling when a design lands.
//
// forwardRef + tabIndex exist for callers that have to move focus to the
// message itself — e.g. SettingsPage's history count, which becomes the landing
// spot when the "Load more" button unmounts on the last page and would
// otherwise drop focus to <body>. Both are optional; existing callers are
// unaffected.
const StatusMessage = React.forwardRef((
  { message, isError = false, loading = false, id, className, style, tag = 'p', tabIndex, persistent = false, children },
  ref
) => {
  const Tag = tag;
  const variantClassName = loading ? 'status-message--loading' : undefined;

  // Screen readers announce changes inside a live region that was already
  // present; a region inserted into the DOM with its text already in it is
  // usually missed entirely. `persistent` keeps the region mounted while empty
  // so the first message is a change rather than an insertion. Opt-in, because
  // most callers render a one-off outcome where an always-present empty node
  // would be pointless. Default tag is `<p>`, which still gets its browser
  // margin while empty, so it'd show as a blank gap without a reset. The
  // empty node carries its own `status-message--empty` class (not caller
  // styling) so global.css can zero that margin/padding without reaching
  // every other `[aria-live]` region in the app.
  if (!message && !children) {
    if (!persistent) return null;
    return (
      <Tag
        ref={ref}
        id={id}
        role={isError ? 'alert' : 'status'}
        aria-live={isError ? 'assertive' : 'polite'}
        className="status-message--empty"
        tabIndex={tabIndex}
      />
    );
  }
  // children lets a caller render richer content (e.g. a follow-up bullet
  // list) than a single string — pass tag="div" alongside it, since block
  // content like a <ul> isn't valid inside the default <p>.
  return (
    <Tag
      ref={ref}
      id={id}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={[className, variantClassName].filter(Boolean).join(' ') || undefined}
      style={style}
      tabIndex={tabIndex}
    >
      {children || message}
    </Tag>
  );
});

StatusMessage.displayName = 'StatusMessage';

export default StatusMessage;
