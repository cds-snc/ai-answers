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
// future spinner/animation instead of overloading `isError` or having each
// call site hand-roll its own loading markup. `id` is exposed so a loading
// or error message can be the target of another element's aria-describedby
// (e.g. a disabled button explaining why).
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
// TODO: the `loading` variant still has no spinner markup — add one
// (inline, alongside/replacing the text; not a popup/toast — no other part
// of the app uses that pattern, and it'd need its own focus/dismiss/
// stacking handling) with prefers-reduced-motion handling when a design
// lands. Also worth a follow-up pass: some call sites still pass their own
// `style` prop instead of a token-backed variant — migrate those too as
// they're touched.
//
// forwardRef + tabIndex exist for callers that have to move focus to the
// message itself — e.g. SettingsPage's history count, which becomes the landing
// spot when the "Load more" button unmounts on the last page and would
// otherwise drop focus to <body>. Both are optional; existing callers are
// unaffected.
const VARIANTS = {
  error: { className: 'dashboard-error', isError: true, icon: 'warning-triangle' },
  warning: { className: 'dashboard-warning-box', isError: false, icon: 'warning-triangle' },
  info: { className: 'dashboard-info-box', isError: false, icon: 'info-circle' },
  success: { className: 'dashboard-success-box', isError: false, icon: 'fa-check-circle' },
};

const VariantIcon = ({ name }) =>
  name === 'fa-check-circle' ? (
    <span className="gcds-icon fa fa-solid fa-check-circle" aria-hidden="true"></span>
  ) : (
    <GcdsIcon name={name} marginRight="50" />
  );

const StatusMessage = React.forwardRef((
  { message, isError = false, loading = false, id, className, style, tag = 'p', tabIndex, persistent = false, variant, children },
  ref
) => {
  const variantConfig = variant ? VARIANTS[variant] : null;
  const resolvedIsError = variantConfig ? variantConfig.isError : isError;
  // Box variants are always block-level content (icon + text side by side);
  // a caller-supplied `tag` only applies when there's no variant to style.
  const Tag = variantConfig ? 'div' : tag;
  const variantClassName = variantConfig
    ? variantConfig.className
    : loading
      ? 'status-message--loading'
      : undefined;

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
        role={resolvedIsError ? 'alert' : 'status'}
        aria-live={resolvedIsError ? 'assertive' : 'polite'}
        className="status-message--empty"
        tabIndex={tabIndex}
      />
    );
  }
  // children lets a caller render richer content (e.g. a follow-up bullet
  // list, or its own icon) than a single string — pass tag="div" alongside
  // it, since block content like a <ul> isn't valid inside the default <p>.
  // Without children, a variant builds its own icon+message content.
  const content = children || (variantConfig ? (
    <>
      <VariantIcon name={variantConfig.icon} />
      {message}
    </>
  ) : message);
  return (
    <Tag
      ref={ref}
      id={id}
      role={resolvedIsError ? 'alert' : 'status'}
      aria-live={resolvedIsError ? 'assertive' : 'polite'}
      className={[className, variantClassName].filter(Boolean).join(' ') || undefined}
      style={style}
      tabIndex={tabIndex}
    >
      {content}
    </Tag>
  );
});

StatusMessage.displayName = 'StatusMessage';

export default StatusMessage;
