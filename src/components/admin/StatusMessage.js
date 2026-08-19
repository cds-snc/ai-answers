import React from 'react';
import { GcdsIcon } from '@gcds-core/components-react';

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
// spinner instead of overloading `isError` or having each call site
// hand-roll its own loading markup. `id` is exposed so a loading or error
// message can be the target of another element's aria-describedby (e.g. a
// disabled button explaining why).
//
// `variant` is the box-styled outcome family: 'error' | 'warning' | 'info' |
// 'success'. It wires up the box className (the GC DS red/yellow/blue/green
// -100/500/700 token triads in admin.css), the role/aria-live (error is the
// only variant that's assertive), and a leading icon, all from one prop —
// this is what SettingsPage.js's several near-identical call sites used to
// hand-roll individually (pick tag='div'/'p', pick a className with/without
// the box modifier, build a children fragment with/without a GcdsIcon). Pass
// `message` as a plain string with `variant` and this component builds the
// icon+text content; `isError`/manual `className` box modifiers are only
// still needed for callers that haven't migrated. `success` uses a raw FA
// checkmark span (`fa-solid fa-check-circle`) instead of GcdsIcon, matching
// the existing precedent in BatchUpload.js — GC DS's icon font has no
// checkmark glyph. A caller that passes `children` alongside `variant` gets
// the box/role treatment but is responsible for its own icon (an escape
// hatch for content richer than "icon + one string").
//
// TODO (design review): none of this component's CSS — the four variant
// boxes, the loading box, the plain isError/tag styling — has had an actual
// design pass; it was built engineering-led to close a11y gaps. Treat every
// class here as functional but provisional until design signs off.
//
// Scope, deliberately: this component owns ARIA wiring + focus management +
// styling for outcomes (error/warning/info/success) and the general-purpose
// "still working" inline state (`loading`) — any page might need either of
// these, so both live here. What's NOT here, on purpose:
//   - The full-page loading overlay (`LoadingOverlay.js`) — that's not
//     general-purpose the way `loading` is; it's specific to dashboards with
//     a filter-driven fetch (blocks the whole page while filtered results
//     reload). Narrow enough to earn its own file rather than another prop
//     here.
//   - Determinate progress (a known total, e.g. "chunk 3 of 10") — a third,
//     different thing again, and doesn't belong here as a `progress`
//     variant. See ExperimentalAnalysisPage.js's renderProgressCards for the
//     established pattern (a real role="progressbar" + a plain role="status"
//     text line, as its own small component).
//
// TODO (review): `persistent` + `className="sr-only"` is a fourth usage
// shape — an invisible live region that exists purely to announce a change
// sighted users would otherwise notice visually but screen reader users
// wouldn't (ConnectivityPage.js's test-completion summary; VectorPage.js's
// stats-loaded and docdb8-probe-complete announcements — three found in this
// PR's scope alone). It's not really "an outcome" the way variant/loading
// are; it's closer to a standalone accessibility primitive that happens to
// reuse this component's role/aria-live plumbing via two props not otherwise
// meant to combine this way. Few enough occurrences that it may not be worth
// a dedicated component yet — flagging as a pattern to watch, not deciding
// either way.
// `loading` and `variant` are resolved through one lookup (resolveLook,
// below) rather than three separate hand-synced conditionals — that used to
// be the failure mode here: `loading` shipped with its content/className
// branches correct but its tag-forcing conditional not updated at the same
// time, so its spinner <div> ended up nested inside the default <p>, invalid
// HTML. One lookup makes that specific bug structurally hard to reintroduce,
// which is why `loading` living here again is safe now, not a reversion of
// the fix — see resolveLook's own comment.
//
// forwardRef + tabIndex exist for callers that have to move focus to the
// message itself — e.g. SettingsPage's history count, which becomes the landing
// spot when the "Load more" button unmounts on the last page and would
// otherwise drop focus to <body>. Both are optional; existing callers are
// unaffected.
const VARIANTS = {
  error: { className: 'status-message--error-box', isError: true, icon: 'warning-triangle' },
  warning: { className: 'status-message--warning-box', isError: false, icon: 'warning-triangle' },
  info: { className: 'status-message--info-box', isError: false, icon: 'info-circle' },
  success: { className: 'status-message--success-box', isError: false, icon: 'fa-check-circle' },
};

const VariantIcon = ({ name }) =>
  name === 'fa-check-circle' ? (
    <span className="gcds-icon fa fa-solid fa-check-circle" aria-hidden="true"></span>
  ) : (
    <GcdsIcon name={name} marginRight="50" />
  );

// Every "look" this component can render — a plain message, the loading
// spinner, or one of the four variant boxes — resolves to a single object
// bundling everything that look needs: whether it requires block-level
// content (forcing Tag to 'div'), its CSS class, and its content (icon/
// spinner + message, or the caller's own `children`). See the file-level
// comment above for why this one lookup (rather than three separate
// conditionals) is what makes combining `loading` and `variant` safe.
function resolveLook({ variant, loading, message, isError, children }) {
  const variantConfig = variant ? VARIANTS[variant] : null;
  if (variantConfig) {
    return {
      isError: variantConfig.isError,
      isBlock: true,
      className: variantConfig.className,
      content: children || (
        <>
          <VariantIcon name={variantConfig.icon} />
          {message}
        </>
      ),
    };
  }
  if (loading) {
    return {
      isError,
      isBlock: true,
      className: 'status-message--loading',
      content: children || (
        <>
          <div className="loading-animation" aria-hidden="true"></div>
          {message}
        </>
      ),
    };
  }
  return {
    isError,
    isBlock: false,
    className: undefined,
    content: children || message,
  };
}

const StatusMessage = React.forwardRef((
  { message, isError = false, loading = false, id, className, style, tag = 'p', tabIndex, persistent = false, variant, children },
  ref
) => {
  const look = resolveLook({ variant, loading, message, isError, children });
  // Box variants and `loading` both render block-level content (icon/spinner
  // + text side by side) — a caller-supplied `tag` only applies when the
  // resolved look doesn't need block content.
  const Tag = look.isBlock ? 'div' : tag;

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
        role={look.isError ? 'alert' : 'status'}
        aria-live={look.isError ? 'assertive' : 'polite'}
        className="status-message--empty"
        tabIndex={tabIndex}
      />
    );
  }
  return (
    <Tag
      ref={ref}
      id={id}
      role={look.isError ? 'alert' : 'status'}
      aria-live={look.isError ? 'assertive' : 'polite'}
      className={[className, look.className].filter(Boolean).join(' ') || undefined}
      style={style}
      tabIndex={tabIndex}
    >
      {look.content}
    </Tag>
  );
});

StatusMessage.displayName = 'StatusMessage';

export default StatusMessage;
