import React from 'react';
import { GcdsIcon } from '@gcds-core/components-react';

// Shared live-region pattern for announcing the outcome of an async admin
// action (save/delete/import/export/test-run/upload results, autosave
// failures, etc.). Several admin tools had this outcome rendered as plain
// DOM text with no role at all, so screen-reader users got no indication
// anything happened. role="alert" (assertive) is for genuine failures;
// role="status" (polite) covers everything else — success and informational
// results — so it doesn't interrupt whatever the user is doing. See
// BatchPage.js's statusMessage state for the reference usage this was
// extracted from.
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
// boxes, the plain isError/tag styling — has had an actual design pass; it
// was built engineering-led to close a11y gaps. Treat every class here as
// functional but provisional until design signs off.
//
// Scope, deliberately: this component owns ARIA wiring + focus management +
// styling for outcomes (error/warning/info/success) — that's the complete
// set; it isn't expected to grow further variants. Two things that look
// related on the surface are deliberately NOT here:
//   - An in-progress ("still working") indicator isn't an outcome — see
//     Loading.js's LoadingStatus (inline) / LoadingOverlay (full-page),
//     which used to be a `loading` prop on this component. Folding it back
//     in would reintroduce a real bug this had: `loading` and `variant` were two
//     independent visual modes whose block-content requirement had to be
//     reconciled by hand in three separate places (the tag, the className,
//     the content), and one of those three was missed when `loading`
//     shipped — its spinner <div> ended up nested inside the default <p>,
//     invalid HTML. Splitting them into their own components makes that
//     class of bug structurally impossible instead of just better-organized.
//   - Determinate progress (a known total, e.g. "chunk 3 of 10") isn't an
//     outcome or an in-progress wait either — it's a third, different thing,
//     and doesn't belong here as a `progress` variant. See
//     ExperimentalAnalysisPage.js's renderProgressCards for the established
//     pattern (a real role="progressbar" + a plain role="status" text line,
//     as its own small component).
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

// Every "look" this component can render — a plain message or one of the
// four variant boxes — resolves to a single object bundling everything
// that look needs: whether it requires block-level content (forcing Tag to
// 'div'), its CSS class, and its content (icon + message, or the caller's
// own `children`). See the file-level comment above for why this used to
// also cover a `loading` look and no longer does.
function resolveLook({ variant, message, isError, children }) {
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
  return {
    isError,
    isBlock: false,
    className: undefined,
    content: children || message,
  };
}

const StatusMessage = React.forwardRef((
  { message, isError = false, id, className, style, tag = 'p', tabIndex, persistent = false, variant, children },
  ref
) => {
  const look = resolveLook({ variant, message, isError, children });
  // Box variants render block-level content (icon + text side by side) — a
  // caller-supplied `tag` only applies when the resolved look doesn't need
  // block content.
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
