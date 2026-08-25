# Status and Error Messaging

Read this before rendering any save/delete/import/export/test-run/upload outcome, autosave failure, loading state, or form validation error — admin tooling or otherwise.

Use `src/components/admin/StatusMessage.js` for any save/delete/import/export/test-run/upload outcome, autosave failure, or general-purpose "still working" state on an admin page — don't hand-roll a plain `<div>`/`<p>`/`alert()` for this. A lot of the admin section had these render as plain DOM text (or a native `alert()` popup) with no ARIA role at all, so screen-reader users got zero indication anything happened; this component is the fix, standardized in one place instead of reinvented per page.

```jsx
import StatusMessage from '../components/admin/StatusMessage.js';

<StatusMessage message={statusMessage?.text} isError={statusMessage?.isError} />
// in-progress state, not a completed result — same component, own sub-type:
<StatusMessage loading message={t('some.page.loading')} />
// box-styled outcome (role/aria-live, box className, and icon all wired up
// from one prop instead of the caller building them individually):
<StatusMessage variant="success" message={t('some.page.saved')} />
```

It renders `role="alert"`/`aria-live="assertive"` when `isError` (or `variant="error"`), otherwise `role="status"`/`aria-live="polite"`. Pass `null`/`undefined`/`''` as `message` to render nothing. Pass `id` when another element needs to reference it via `aria-describedby` (e.g. a disabled button explaining why).

`variant` (`error` | `warning` | `info` | `success`) is the box-styled outcome family — pass it with `message` as a plain string and StatusMessage builds the box `className`, `role`/`aria-live`, and a leading icon itself, using the GC DS-token box classes in `admin.css`: `status-message--error-box` (red-100/500/700, failures), `status-message--warning-box` (yellow-100/500/700, cautions like unsaved changes), `status-message--info-box` (blue-100/500/700, neutral confirmations), `status-message--success-box` (green-100/500/700, completed saves). Each pairs with a `GcdsIcon` (`warning-triangle` for error/warning, `info-circle` for info) except `success`, which uses a raw FA `check-circle` span (`fa-solid fa-check-circle`) since GC DS's icon font has no checkmark glyph — matching the existing FA precedent in `BatchUpload.js`. Every box state (the four variants plus `loading`) is `width: fit-content` with a `max-width: 65ch` cap by default — content in this app is line-length-restricted (~65 char), so a box never needs to stretch to fill a wide container, and a long message wraps inside a standardized width instead of growing unbounded. Reuse one of these four variants rather than adding a fifth box class or a page's own ad-hoc hex colours — if a genuinely new outcome type comes up, extend `StatusMessage`'s own `VARIANTS` map (a caller passing `children` instead of `message` alongside `variant` gets the box/role treatment while supplying its own richer content, e.g. a bullet list, without needing a new variant). Callers that haven't migrated to `variant` yet (still wiring up `isError`/`className`/`children` manually) are unaffected — it's additive, not a breaking change — but prefer `variant` for anything new.

**Still a TODO:** this whole 4-variant system (colours, icon choices, the FA-vs-GcdsIcon split, spacing) was built code-first-accessibility-led, not through an actual design refinement pass yet — treat it as functional but provisional, not a settled design-approved pattern, until that review happens.

**`GcdsNotice` vs. `StatusMessage`: pick by whether the content changes.** `GcdsNotice`'s actual rendered markup is a plain `<section>` — no `role`, no `aria-live`, anywhere (verified against its compiled source, `@gcds-core/components/.../gcds-notice.js`). That's fine for static, in-page content that's already there when the page loads (a permanent banner, a fixed disclosure) — it doesn't need a live region because nothing about it changes after mount. It's the wrong choice for anything that appears, disappears, or changes after mount: a `GcdsNotice` inserted into the DOM once some state flips gets zero announcement to screen-reader users — sighted users see a box appear, AT users get nothing. Use `StatusMessage` for that case instead; that's exactly what it's for.

*Worked example:* `App.js`'s session-about-to-expire warning (`sessionWarningVisible`) used `GcdsNotice`, appearing mid-session while the user was doing something else entirely on whatever page they were on — completely silent to AT the whole time this shipped, with no error and no test to catch it, same failure mode as a dropped prompt tag. Fixed by switching to `StatusMessage variant="warning"`. `LoginPage.js`'s session-expired notice had the identical bug, fixed the same way, plus an explicit focus-move (`useFocusOnChange`) since it's a one-time mount-time message explaining a redirect the user didn't initiate — same category as `ResetCompletePage.js`'s invalid-link case above, not the ambient case `App.js`'s warning is.

*When not to migrate:* if the existing markup is too bespoke to fit `StatusMessage`'s message/`children` shape — a custom layout, not really "a message" — don't force it. Add `role="status"`/`aria-live="polite"` (or `"assertive"` for a genuine failure) directly to the existing element instead. See `AdminNotifications.js`'s pending-accounts panel: its own stat-list-plus-action-link layout doesn't map onto `StatusMessage` cleanly, so it keeps its bespoke markup and just gets the aria wiring added directly, `polite` since these are routine counts, not an urgent failure.

**Full-page loading overlay is a separate component — `src/components/admin/LoadingOverlay.js`, not `StatusMessage`.** `StatusMessage`'s `loading` is general-purpose (any page might need an inline "still working" message) and lives here on purpose. `LoadingOverlay` is narrower — a full-page backdrop for when there's genuinely nothing else actionable on the page until the operation finishes (every other control is already disabled for the same duration anyway) — and stays in its own file for that reason, not because it's structurally different (it isn't; it's `role="status"` too). The original, narrower framing of this was "a dashboard's filter-driven fetch reloads" (still the most common case — `PartnerDashboard.js`, `PublicDashboard.js`, `ChatLogsDashboard.js`, `EvalDashboardPage.js`, `AutoEvalDashboardPage.js`, `ChatDashboardPage.js`), but the actual test is broader than dashboards or filters: `ScenarioOverridesPage.js` uses it for a single-department data load and for its Save/Revert actions, neither of which is a dashboard or a filter. If a page's controls are all disabled for a stretch and an inline `StatusMessage loading` is sitting next to them anyway, that's very likely a `LoadingOverlay` case instead — worth checking other pages for that same pattern opportunistically. Determinate progress (a known total, e.g. "chunk 3 of 10") isn't either of these — a third, different thing again — and doesn't belong in `StatusMessage` as a `progress` variant or in `LoadingOverlay` as a mode; see `ExperimentalAnalysisPage.js`'s `renderProgressCards` for the established pattern (a real `role="progressbar"` + a plain `role="status"` text line, its own small component). `loading` and `variant` inside `StatusMessage` are resolved through one lookup (`resolveLook`) rather than three separate hand-synced conditionals — that used to be the failure mode here: `loading` shipped with its content/className correct but its tag-forcing conditional not updated at the same time, so its spinner ended up nested inside an invalid `<p>`. The one-lookup structure is what makes `loading` and `variant` safe to keep in the same component; it's not something to re-split without a reason.

```jsx
import LoadingOverlay from '../components/admin/LoadingOverlay.js';

{loading && <LoadingOverlay message={t('some.page.loading')} />}
```

**Screen-reader-only outcome announcements.** Ask this whenever a change updates the screen **visually** with no other cue: *does anything else already tell a screen reader user this happened?* A native `<select>` announces its own new value; a `StatusMessage variant`/`loading` box being inserted is itself a DOM change inside a live region. But some outcomes update the page with nothing else in the accessibility tree to notice — e.g. a debounced field auto-applying, a background probe finishing, an admin action's only feedback being a value elsewhere on the page changing. Those need an explicit sr-only announcement, or screen reader users get no signal at all that anything happened.

The pattern: render an invisible, always-mounted live region via `<StatusMessage persistent className="sr-only" message={...} nonce={...} />`, and manage its `message`/`nonce` state with the companion `useSrAnnouncer` hook, colocated in `StatusMessage.js` itself (same precedent as `RoleBasedUI.js`'s `useHasRole`/`useHasAnyRole` living alongside `RoleBasedContent`) so both come from one import:

```jsx
import StatusMessage, { useSrAnnouncer } from '../admin/StatusMessage.js';

const { message, nonce, announce, clear } = useSrAnnouncer();
// ...
announce(t('some.outcome.announcement'));
// clear() resets the message without bumping nonce, for a caller that needs
// to reset a stale value before starting a new action — doesn't itself
// need announcing.
// ...
<StatusMessage persistent className="sr-only" message={message} nonce={nonce} />
```

`persistent` keeps the region mounted while empty (so the first announcement is a change, not a missed insertion); `nonce` forces re-announcement even when the same text fires twice in a row (React bails on an identical-string update otherwise). `useSrAnnouncer` only owns the message+nonce bookkeeping — all the actual ARIA/live-region mechanics still live in `StatusMessage` itself. See `ChatOptions.js`'s referring-URL apply/clear for the reference usage.

Use the hook for any sr-only announcement rather than re-deriving the same `useState` pair. (Several dashboard pages feed this same `StatusMessage persistent ... className="sr-only"` shape from `searchAnnouncement`/`searchAnnounceNonce` instead — those already go through `useSearchAnnouncement`, not a hand-rolled copy, and don't need migrating.)

**`StatusMessage` vs. form-field errors:** `StatusMessage` is not a forms component — it's
for page/section-level outcomes and messages that aren't about any single input (save/
delete/import/export results, a signup's pending-approval state, a network failure with
nothing to correct). A validation error tied to one specific field uses a different,
separate family instead — `src/components/chat/FeedbackInlineError.js`,
`src/components/auth/AnnouncedError.js`, and `src/components/chat/ExplanationErrorSummary.js`
— which wires the error to its field via `id`/`aria-describedby` and moves focus to it on
submit failure (`inputRef`/`tabIndex={-1}`). Don't reach for `StatusMessage` for a
field-level error, and don't reach for the form-error family for a page-level outcome that
isn't about one input.

**Within that form-error family: single message vs. multi-field summary.**
`AnnouncedError`/`FeedbackInlineError` are both "one message for one thing" — a page-level
auth/system error, or one field's own validation error. `ExplanationErrorSummary.js` is a
different shape: a summary box (heading + an ordered list of jump-links, matching GC DS's
`gcds-error-summary`) for when *multiple* fields on the same form fail validation at once —
each link focuses and scrolls to its own field, rather than describing just one problem.
Reach for it when a form can have several simultaneously-invalid fields at submit time (see
`SettingsPage.js`/`ExpertFeedbackComponent.js`), not for a single error, even a page-level
one — that's still `AnnouncedError`/`StatusMessage`'s job depending on whether it's
field-tied.

**`StatusMessage` doesn't move focus *as standard* — that's a default, not an absolute
limitation.** Most callers render it right next to whatever the user just triggered (a Save
button, a submit action), so their attention/focus is already nearby and an ARIA live-region
announcement is enough on its own — that's the common case this default fits. A
`StatusMessage` outcome with **no adjacent trigger** — most often a check that runs once on
page mount, before any interaction (an invalid/expired link, say) — genuinely needs focus
moved to it, the same way `AnnouncedError`'s callers get. Don't solve that by switching the
message to `AnnouncedError` just to borrow its focus-move: `StatusMessage` already forwards
`ref`/`tabIndex`, so give it its own `useFocusOnChange(counter)` ref and `tabIndex={-1}`
instead, driven by a counter dedicated to that one trigger — not the same state any other,
adjacent-to-their-trigger outcome on the same page uses, which should stay focus-move-free
per the default above. See `ResetCompletePage.js`'s invalid-reset-link check for the
reference implementation.

**`FeedbackInlineError` needs `errorCount`, or repeat identical failures go silent.**
`FeedbackInlineError` renders `<p key={errorCount} role="alert">` — the `key` is what
forces React to mount a fresh DOM node (and therefore re-announce/re-focus) on every
trigger. If a call site sets its error message with plain `useState` + `setError(text)`
instead of passing `errorCount`, then two submits in a row with the *same* invalid input
(e.g. an empty required field clicked twice with no edit in between) produce the same
string both times — React bails on the identical-value update, the DOM never mutates,
and the second failure is silently un-announced to screen-reader users. This has shipped
more than once from copying an existing field-error call site that itself never passed
`errorCount` (`DatabasePage.js`'s `fileSelectError` is one such precedent — don't copy it
further).

For a single required-field validation (the common case: "you must fill in / select
this"), use `src/hooks/useInlineFormError.js` instead of a bare `useState`:

```jsx
import { useInlineFormError } from '../hooks/useInlineFormError.js';

const { hasError, errorCount, errorRef, triggerError, clearError } = useInlineFormError();

// on invalid submit: triggerError();  (increments errorCount even on repeat failures)
// on valid input / value change: clearError();

{hasError && (
  <FeedbackInlineError
    id="my-field-error"
    message={t('my.field.error')}
    errorCount={errorCount}
    inputRef={errorRef}
  />
)}
```

See `PublicFeedbackComponent.js` / `ExpertFeedbackComponent.js` for the established
usage. If a field's error text genuinely varies per failure (not just a fixed message),
a bare `useState` is fine, but the `<FeedbackInlineError>` still needs an `errorCount`
that increments on every trigger — derive it from a counter, not from the message text.

**`FeedbackInlineError` renders above the field it describes, not below.** See
`SettingsPage.js`'s `SettingsTextArea` for the established order — the error markup comes
first, the input second, both still linked via `aria-describedby`. Placing it after the
field is a layout inversion of this convention, not a style choice.

**Prefer rejecting the interaction over disabling the control, when the disabled reason
needs explaining.** A `disabled` element is pulled out of the tab order, so an
`aria-describedby` hint attached to it is practically undiscoverable to a keyboard-only or
screen-reader user — they never land on the control to have the description read. This
satisfies SC 4.1.2 (Name, Role, Value) in the letter — the disabled state is still
programmatically exposed — but fails the actual point of pairing it with an explanation.
Where the "why can't I do this" reason isn't otherwise obvious from context, keep the
control enabled/focusable, let the interaction happen, and surface the problem via SC 3.3.1
Error Identification instead — the same `useInlineFormError`/`FeedbackInlineError` pattern
above, triggered from the control's own change/click handler rather than a submit handler.
See `ScenarioOverridesPage.js`'s "use this scenario for testing" checkbox: checking it
before an edit has been made is rejected with an inline error (React's controlled `checked`
just snaps back since state isn't updated), not blocked by disabling the checkbox. This
doesn't apply to every disabled control — one disabled for a self-evident reason already
visible elsewhere on screen (e.g. a Save button disabled because nothing's been typed yet)
isn't hiding anything and is a normal, accepted gating pattern.

**Interpolating dynamic text (e.g. `error.message`) into a translated template:** don't pass it as the 2nd argument to `String.replace('{placeholder}', dynamicText)` — that argument is a *replacement pattern*, not a literal string, so a `$` sequence in the dynamic text (common in stack traces) gets silently misread as a special token (`$&`, `` $` ``, `$'`, `$$`) and corrupts the message. Use the replacer-*function* form instead, which is used verbatim:

```js
t('admin.deleteChat.error').replace('{message}', () => error.message || String(error))
```

**Never show a raw `err.message`/`error.message` directly to the user.** It's the literal,
untranslated text a JS `Error` or `fetch()` rejection happened to carry (`"Failed to fetch"`,
a driver's internal message, etc.) — always English regardless of the user's language, and
often irrelevant or confusing to show verbatim. `err.message || t('some.fallback')` doesn't
protect against this: `.message` is essentially always truthy on a real `Error`, so the
translated fallback can never actually fire. Two established alternatives, depending on
whether the raw detail is worth keeping: (1) have the backend return a small, stable `code`
field (not free text) and map that through a local object to a `t()` key client-side — see
`ResetCompletePage.js`'s `errorKeys` map; or (2) if the raw detail itself is genuinely useful
to show, wrap only that portion in `<span lang="en">` inside an otherwise-translated
template, so AT pronounces it as English rather than mangling it with the page's own
language rules — see `DeleteChatSection.js`'s `resolveLook()`. A `t()` string with a
`{placeholder}` substituted via `.replace()`/interpolation is *not* equivalent to option 2:
`t()` returns a plain string, which can't embed an HTML element, so the substituted text has
no way to get `lang="en"` and stays unmarked either way.
