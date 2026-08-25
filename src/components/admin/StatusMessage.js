import React, { useState, useCallback } from 'react';
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
// the box/role treatment AND the same icon `message` would have gotten —
// `children` is only an escape hatch for content richer than one string
// (e.g. a raw exception detail that needs its own <span lang="en">), not a
// way to opt out of the icon. (It used to be — see resolveLook's own
// comment for why that shipped 5 icon-less error boxes before this fixed
// it at the root.)
//
// TODO (design review): none of this component's CSS — the four variant
// boxes, the loading box, the plain isError/tag styling — has had an actual
// design refinement pass yet; it was built code-first-accessibility-led to
// close a11y gaps. Treat every class here as functional but provisional
// until design signs off.
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
// `persistent` + `className="sr-only"` is a fourth usage shape — an
// invisible live region that exists purely to announce a change sighted
// users would otherwise notice visually but screen reader users wouldn't
// (ConnectivityPage.js's test-completion summary; VectorPage.js's
// stats-loaded and docdb8-probe-complete announcements; BatchPage.js's and
// BatchList.js's completion announcements; ChatOptions.js's referring-URL
// apply/clear). It's not really "an outcome" the way variant/loading are;
// it's a standalone accessibility primitive that reuses this component's
// role/aria-live plumbing via two props not otherwise meant to combine this
// way. See AGENTS.md's "Announcing status, errors, and async outcomes"
// (Screen-reader-only outcome announcements) for when this shape is needed,
// and the `useSrAnnouncer` hook below for its message+nonce bookkeeping.
//
// `nonce` exists for exactly these persistent+sr-only announcers: a plain
// `message` string is only re-announced when its *value* changes, so a
// repeated action with an identical outcome (e.g. running the same probe
// twice with the same pass/fail result) sets the same string, React bails
// on the no-op update, and the second occurrence is silently un-announced.
// Passing a value that changes on every trigger (a counter, a timestamp —
// anything, its content is never read) as `nonce` folds it into the
// rendered element's `key`, which forces a remount — same technique as
// FeedbackInlineError's `key={errorCount}`, generalized here since variant/
// loading callers render a fresh one-off outcome each time and don't need
// it. Optional; omit it for that common case.
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
      // Icon is unconditional — every real `children` caller in this
      // codebase only reaches for `children` to wrap part of the text in
      // e.g. <span lang="en">, never for a genuinely icon-less shape, and
      // the old `children || (icon + message)` short-circuited the icon
      // out entirely whenever `children` was passed. That was the actual
      // cause behind 5 separate call sites shipping error boxes with no
      // icon (found by inspection, not by design) - fixed at the root
      // instead of leaving it as a footgun every future caller can still
      // hit. `children` still exists for richer content than one string;
      // it just no longer implies "and also drop the icon."
      content: (
        <>
          <VariantIcon name={variantConfig.icon} />
          {children || message}
        </>
      ),
    };
  }
  if (loading) {
    return {
      isError,
      isBlock: true,
      className: 'status-message--loading',
      // Same fix as the variant branch above, same reasoning: the spinner
      // shouldn't be conditional on whether the caller used `message` or
      // `children` for the text. No current `loading` caller passes
      // `children` (all three use `message`), so this was a latent
      // version of the exact bug fixed above, not yet a live one — fixed
      // anyway rather than leaving the same footgun for the first future
      // caller that does.
      content: (
        <>
          <div className="loading-animation" aria-hidden="true"></div>
          {children || message}
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
  { message, isError = false, loading = false, id, className, style, tag = 'p', tabIndex, persistent = false, variant, children, nonce },
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
  //
  // aria-atomic="true" on both branches: even with `persistent` correctly
  // keeping the same DOM node across the empty→filled transition, going
  // from a genuinely childless element to several new child elements at
  // once (icon + one or more paragraphs, not just a text-node change) is a
  // structural mutation VoiceOver/Safari in particular is documented to
  // handle unreliably when the AT has to infer what changed from a diff.
  // aria-atomic tells it to just read the whole region on any change
  // instead of computing that diff - the standard WAI-ARIA fix for this,
  // not a StatusMessage-specific workaround. Applies to every caller
  // (variant boxes, loading, and the persistent sr-only pattern) since they
  // all render through these same two elements.
  // Tradeoff: re-reads the *entire* region on every change, which gets
  // verbose/repetitive for a large or frequently-updating region. Not a
  // concern here - every StatusMessage instance holds one short message
  // that updates rarely (a save result, a warning appearing once), never a
  // large or rapidly-changing block.
  if (!message && !children) {
    if (!persistent) return null;
    return (
      <Tag
        key={nonce}
        ref={ref}
        id={id}
        role={look.isError ? 'alert' : 'status'}
        aria-live={look.isError ? 'assertive' : 'polite'}
        aria-atomic="true"
        className="status-message--empty"
        tabIndex={tabIndex}
      />
    );
  }
  return (
    <Tag
      key={nonce}
      ref={ref}
      id={id}
      role={look.isError ? 'alert' : 'status'}
      aria-live={look.isError ? 'assertive' : 'polite'}
      aria-atomic="true"
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

// Companion hook for the `persistent`+sr-only usage above: owns just the
// message+nonce bookkeeping a caller needs to drive that live region (see
// this file's earlier comment on that usage shape). Colocated here rather
// than under src/hooks/ — same precedent as RoleBasedUI.js's useHasRole/
// useHasAnyRole living alongside RoleBasedContent — so a caller gets the
// component and its bookkeeping from one import instead of two.
//
// `announce` takes an already-resolved string, not a locale key, so this
// hook stays translation-agnostic — callers do `announce(t('some.key'))`.
// `clear` resets the message without bumping `nonce` — clearing to empty
// isn't itself an outcome worth (re-)announcing, it's a caller resetting a
// stale value before starting a new action, same purpose as
// useInlineFormError's `clearError`.
export function useSrAnnouncer() {
  const [message, setMessage] = useState(null);
  const [nonce, setNonce] = useState(0);

  const announce = useCallback((text) => {
    setMessage(text);
    setNonce((n) => n + 1);
  }, []);

  const clear = useCallback(() => {
    setMessage(null);
  }, []);

  return { message, nonce, announce, clear };
}
