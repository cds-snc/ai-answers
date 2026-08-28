import React, { useRef, useState, useCallback } from 'react';
import { GcdsIcon } from '@gcds-core/components-react';
import { useAnnounceOnChange } from '../../hooks/useAnnounceOnChange.js';

// Shared outcome message for an async admin action (save/delete/import/
// export/test-run/upload results, autosave failures, etc.). Several admin
// tools had this outcome rendered as plain DOM text with nothing telling a
// screen reader it happened; this component is the one place that gets
// wired up. See BatchPage.js's statusMessage state for the reference usage
// this was extracted from.
//
// How it's announced: NOT by being a live region itself. This element is
// plain markup for sighted users; the announcement goes through the shared
// always-mounted announcer (src/utils/liveAnnouncer.js) via
// useAnnounceOnChange, which reads this element's rendered text whenever it
// changes. Errors go assertive (role="alert" region), everything else
// polite. That used to be role/aria-live on this element, and it was
// silent nearly everywhere: a live region inserted into the DOM with its
// text already in it is dropped by VoiceOver, and this component was almost
// always conditionally rendered — see liveAnnouncer.js's header for the
// full story, including why the old `persistent`/`nonce`-as-key workaround
// didn't work either.
//
// `announce={false}` is for the one case where the caller moves focus onto
// this message (ScenarioOverridesPage's save outcome, ResetCompletePage's
// invalid link, LoginPage's session-expired notice): focus landing on it
// already reads it, so a live announcement on top is a double read. Pick
// one, never both.
//
// `assertive`: interrupt instead of queueing, for a non-error outcome the
// user is actively waiting on (a dashboard's "no data" completion). Errors
// are always assertive; leave this off for everything else.
//
// `nonce`: re-announce even though the text is identical to last time
// (saving twice in a row, a search landing on zero results twice). Pass
// any value that changes per trigger (a counter); its content is never
// read. Omit for the common case of a fresh one-off outcome.
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
// -100/500/700 token triads in admin.css), assertive-vs-polite (error is the
// only assertive variant), and a leading icon, all from one prop — this is
// what SettingsPage.js's several near-identical call sites used to
// hand-roll individually. Pass `message` as a plain string with `variant`
// and this component builds the icon+text content; `isError`/manual
// `className` box modifiers are only still needed for callers that haven't
// migrated. `success` uses a raw FA checkmark span (`fa-solid
// fa-check-circle`) instead of GcdsIcon, matching the existing precedent in
// BatchUpload.js — GC DS's icon font has no checkmark glyph. A caller that
// passes `children` alongside `variant` gets the box treatment AND the same
// icon `message` would have gotten — `children` is only an escape hatch for
// content richer than one string (e.g. a raw exception detail that needs
// its own <code lang="en">), not a way to opt out of the icon. (It used to
// be — see resolveLook's own comment for why that shipped 5 icon-less error
// boxes before this fixed it at the root.)
//
// TODO (design review): the four variant boxes lay out icon + content as
// plain inline flow (unlike .status-message--loading, which is already
// display:flex) — fine for a one-line `message` string, but `children` with
// a block element (e.g. RegisterPage.js's two-<p> pending-approval message)
// forces a line break right after the icon, stranding it above the text
// instead of beside it. Needs a content wrapper (icon + wrapper as two flex
// items, wrapper holding however many paragraphs) to fix properly, not a
// CSS-only patch — bundling into the design pass below rather than doing
// it ad hoc.
//
// TODO (design review): none of this component's CSS — the four variant
// boxes, the loading box, the plain isError/tag styling — has had an actual
// design refinement pass yet; it was built code-first-accessibility-led to
// close a11y gaps. Treat every class here as functional but provisional
// until design signs off.
//
// Scope, deliberately: this component owns announcement wiring + focus
// hooks + styling for outcomes (error/warning/info/success) and the
// general-purpose "still working" inline state (`loading`) — any page might
// need either of these, so both live here. What's NOT here, on purpose:
//   - The full-page loading overlay (`LoadingOverlay.js`) — that's not
//     general-purpose the way `loading` is; it's specific to pages where
//     nothing else is actionable until the operation finishes. Narrow
//     enough to earn its own file rather than another prop here.
//   - Determinate progress (a known total, e.g. "chunk 3 of 10") — a third,
//     different thing again, and doesn't belong here as a `progress`
//     variant. See ExperimentalAnalysisPage.js's renderProgressCards for the
//     established pattern (a real role="progressbar" + a plain text line,
//     as its own small component).
//   - Screen-reader-only announcements with no visible box at all — call
//     `announce()` from src/utils/liveAnnouncer.js directly. There's no
//     longer a reason to render an invisible StatusMessage for that.
//
// `loading` and `variant` are resolved through one lookup (resolveLook,
// below) rather than three separate hand-synced conditionals — that used to
// be the failure mode here: `loading` shipped with its content/className
// branches correct but its tag-forcing conditional not updated at the same
// time, so its spinner <div> ended up nested inside the default <p>, invalid
// HTML. One lookup makes that specific bug structurally hard to reintroduce.
//
// forwardRef + tabIndex exist for callers that have to move focus to the
// message itself — e.g. SettingsPage's history count, which becomes the
// landing spot when the "Load more" button unmounts on the last page and
// would otherwise drop focus to <body>. Both are optional; existing callers
// are unaffected. A caller that does move focus here should also pass
// `announce={false}` (see above) — and should drive that focus from an
// effect (useFocusOnChange with a counter), not by calling .focus() in the
// same tick as the state update, since this element doesn't exist in the
// DOM until the outcome has rendered.
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
      // e.g. <code lang="en">, never for a genuinely icon-less shape, and
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
      // `children` for the text.
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
  { message, isError = false, loading = false, id, className, style, tag = 'p', tabIndex, variant, children, nonce, announce = true, assertive },
  ref
) => {
  const look = resolveLook({ variant, loading, message, isError, children });
  // Box variants and `loading` both render block-level content (icon/spinner
  // + text side by side) — a caller-supplied `tag` only applies when the
  // resolved look doesn't need block content.
  const Tag = look.isBlock ? 'div' : tag;

  // Own ref for reading rendered text, merged with the caller's forwarded
  // one (which some callers use to move focus here).
  const nodeRef = useRef(null);
  const setRefs = (el) => {
    nodeRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  // `loading` is skippable: a fast operation reads just its outcome, not
  // "Loading…" too (see liveAnnouncer.js). Errors interrupt; anything else
  // queues politely unless the caller passes `assertive` — the dashboards'
  // "no data" outcome does, so the empty case lands as immediately as
  // "Results loaded." does.
  useAnnounceOnChange(nodeRef, { enabled: announce, assertive: assertive ?? look.isError, skippable: loading, nonce });

  if (!message && !children) return null;

  return (
    <Tag
      ref={setRefs}
      id={id}
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

// message + nonce bookkeeping for a *visible* StatusMessage that has to
// re-announce a repeat of the identical outcome (Apply the same URL twice,
// two consecutive "Refresh failed"s). Colocated here rather than under
// src/hooks/ — same precedent as RoleBasedUI.js's useHasRole living
// alongside RoleBasedContent — so a caller gets the component and its
// bookkeeping from one import. For an announcement with no visible box at
// all, don't use this: call announce() from src/utils/liveAnnouncer.js.
//
// `announce` takes an already-resolved string, not a locale key, so this
// stays translation-agnostic — callers do `announce(t('some.key'))`.
// `clear` resets the message without bumping `nonce` — clearing to empty
// isn't itself an outcome worth (re-)announcing, it's a caller resetting a
// stale value before starting a new action.
export function useRepeatableStatus() {
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
