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

Pass `null`/`undefined`/`''` as `message` to render nothing. Pass `id` when another element needs to reference it via `aria-describedby` (e.g. a disabled button explaining why). The box is announced assertively when `isError` (or `variant="error"`), politely otherwise — but **not by being a live region itself**; see the next section.

## How announcements reach a screen reader

**Every announcement goes through the site-wide live regions in `src/utils/liveAnnouncer.js` — never through `role="status"`/`aria-live` on the message element itself.** `StatusMessage` and `LoadingOverlay` are plain markup; each pushes its rendered text to the announcer via `src/hooks/useAnnounceOnChange.js` whenever that text changes. For an outcome with no visible box, call `announce(text)` (or `announce(text, { assertive: true })` for a genuine failure) directly.

The reason: the only live-region pattern every screen reader handles consistently is text *changing inside a node that was already in the DOM*. A `role="status"` element inserted with its text already in it is dropped by VoiceOver (Safari and Chrome); NVDA and JAWS usually read it, so code that seems fine on Windows is silent on a Mac — and nothing fails, no error, no red test. The announcer's regions are created in `src/index.js` before React renders, so they're always already there. (`role="alert"` on insertion is the one case every browser announces — `FeedbackInlineError` still uses it, but only when nothing focuses the error; see the focus-move section.)

Rules:

- **Don't add `role="status"`/`aria-live` to a message, box, overlay, or outcome.** Render it plainly and let `StatusMessage` announce it, or call `announce()` if there's nothing visible to render. A hand-rolled live region is only acceptable on an element that is *always mounted* and only ever changes its content — `AdminNotifications.js`'s pending-accounts panel, `ScenarioOverridesPage.js`'s test-link block, `ScenarioOverrideBanner.js`, and `ChatAppContainer.js`'s own sr-only chat region are the ones that meet that bar. Determinate progress (a bar plus a status line) announces its status line through `useAnnounceOnChange` — see `ExperimentalAnalysisPage.js`'s `ProgressCard`. An element focus is moved onto (`FeedbackComponent.js`'s thank-you, `LoginPage.js`'s 2FA intro, `BatchList.js`'s "Processing…" placeholder) gets no live region at all — focus reads it.
- **Repeat of an identical outcome** (saving twice in a row, a second search landing on zero results): pass a changing `nonce` to `StatusMessage` — it's an "announce again" trigger. `useRepeatableStatus()` (colocated in `StatusMessage.js`) owns the `message`+`nonce` bookkeeping for a visible box that needs this (`ChatOptions.js`'s referring-URL apply/clear, `ChatViewer.js`'s refresh outcomes). `announce()` appends each message to its region as a new child, one at a time with a short gap, so announcements made in quick succession are read in the order they happened (several landing in the same instant get read newest-first by Chrome + VoiceOver), and an identical repeat is its own addition. VoiceOver can still skip an identical sentence it just read, so when an outcome can repeat back-to-back, put something that varies in the sentence — a search's "No results for {term}." — or, when two adjacent actions can produce the same outcome, word them differently (View-by-ID's "No chat found with that ID." vs. Delete's "Cannot delete chat: ID not found.").
- **"Loading…" is skippable.** `LoadingOverlay` and `StatusMessage loading` announce with `skippable: true`: the message waits a short grace before it's spoken and is dropped if the result arrives first, so a fast load reads only its result. Use `skippable` for any in-progress state, never for an outcome.
- **Every dashboard ends a fetch the same way: "Results loaded." (`admin.common.resultsLoaded`, assertive) when there is data, nothing when there is none** — the visible "no data" `StatusMessage` announces the empty case itself, with `assertive` set so it lands just as immediately (it's still `variant="info"`; only the announcement level changes). `assertive` on a non-error `StatusMessage` is for exactly this — a completion the user is waiting on — not for ordinary confirmations. Hook-driven fetches use `useResultsLoadedAnnouncement({ loading, count, t })` (Partner, Public, Metrics, Technical metrics); DataTables ajax callbacks call `useSearchAnnouncement`'s `noteLoadResult(count)` where they learn the count (Chat, Eval) or `announce()` directly (AutoEval). Don't add a dashboard-specific "X loaded" string.
- **A message that appears mid-typing should be announced late, not immediately.** Announcing on the first keystroke talks over the field being edited. Render it with `announce={false}` and `announce()` it from a delayed effect that's cancelled if it goes away — see `SettingsPage.js`'s unsaved-changes warning.
- **If focus is moved onto the message, pass `announce={false}`.** Focus landing on an element reads it; a live announcement on top is a double read. Pick one, never both. See the focus-move section further down for when moving focus is the right call.
- **Data isn't an outcome — don't announce it.** A dashboard's below-threshold cards (`NoDataCard`), chart placeholders, table contents: a screen-reader user reads those by navigating to them, same as the numbers around them. The page-level "no data for these filters" `StatusMessage` is the one announcement that case gets.
- **Client-side route changes announce the page title** (`usePageMetadata`, from the route's `titleKey`) alongside `useRouteChangeFocus`'s focus-to-`<main>` — a `navigate()`/`<Link>` transition has no browser page load, so nothing else names the destination. Don't add a per-page opt-out for a `navigate()` destination (the post-login landing used to have one): without the focus move a screen-reader user is left wherever the previous page's cursor was. Announce the in-progress state before a navigating action that takes time (`LoginPage`'s "Signing in…") since the disabled submit button drops focus and its own label change isn't heard.
- **Announcements clear themselves after ~10s** so stale text ("Loading…") doesn't sit in the accessibility tree for a screen-reader user browsing by cursor.
- **Don't add a repo-wide grep/lint test banning `role="status"`/`aria-live` in `src/`.** The always-mounted exceptions above make it noisy, and a ban would push the next person to delete a region that's correct. The accessibility-review skill is the guard for this.

**Testing an announcement:** `test/liveAnnouncer.js`'s `waitForAnnouncement(text, 'polite' | 'assertive')` waits for the text to land in the announcer and returns what was announced. Don't use `findByRole('alert')`/`getByRole('status')` for this — the only elements with those roles are the site-wide regions, and a query that runs a tick too early finds them empty. Assert the *visible* box by its class (`.status-message--error-box` etc.) or its text. The global test setup (`test/vitest-hooks.js`) excludes the announcer regions from `*ByText` queries and resets the announcer between tests. To unit-test a component's own announcement without the DOM, `vi.mock` `liveAnnouncer.js`'s `announce` — see `StatusMessage.test.js`.

`variant` (`error` | `warning` | `info` | `success`) is the box-styled outcome family — pass it with `message` as a plain string and StatusMessage builds the box `className`, the announcement (assertive for `error`, polite otherwise), and a leading icon itself, using the GC DS-token box classes in `admin.css`: `status-message--error-box` (red-100/500/700, failures), `status-message--warning-box` (yellow-100/500/700, cautions like unsaved changes), `status-message--info-box` (blue-100/500/700, neutral confirmations), `status-message--success-box` (green-100/500/700, completed saves). Each pairs with a `GcdsIcon` (`warning-triangle` for error/warning, `info-circle` for info) except `success`, which uses a raw FA `check-circle` span (`fa-solid fa-check-circle`) since GC DS's icon font has no checkmark glyph — matching the existing FA precedent in `BatchUpload.js`. Every box state (the four variants plus `loading`) is `width: fit-content` with a `max-width: 65ch` cap by default — content in this app is line-length-restricted (~65 char), so a box never needs to stretch to fill a wide container, and a long message wraps inside a standardized width instead of growing unbounded. Reuse one of these four variants rather than adding a fifth box class or a page's own ad-hoc hex colours — if a genuinely new outcome type comes up, extend `StatusMessage`'s own `VARIANTS` map (a caller passing `children` instead of `message` alongside `variant` gets the box/role treatment while supplying its own richer content, e.g. a bullet list, without needing a new variant). Callers that haven't migrated to `variant` yet (still wiring up `isError`/`className`/`children` manually) are unaffected — it's additive, not a breaking change — but prefer `variant` for anything new.

**Picking `info` vs. `success` vs. `warning` isn't about whether the operation "worked" — it's about what actually happened.** `role`/`aria-live` don't change between the three (all `status`/`polite`, only `error` differs), so getting this wrong isn't a live-region bug — but it's still worth getting right, and easy to get wrong by defaulting to whichever variant is "least bad" rather than asking what the message is actually telling the user:
- **`info`** — states an objective fact the user can't act on and didn't cause to happen by completing something (a precheck result, a routine count, a filter returning zero rows). Nothing was achieved or broken; it's just true.
- **`success`** — confirms a real, completed action with an effect (saved, deleted, exported, a value actually applied). If nothing changed, it's not this.
- **`warning`** — a state that's broken, interrupted, or needs attention, even if the *mechanism* that produced it (a poll, a background check) didn't itself fail. "This didn't finish and needs to be re-run" is warning-shaped regardless of whether anything technically errored.
The failure mode isn't reaching for `error` when nothing broke — it's the two subtler ones in the other direction: **a message that merely reports a process *starting* (`"Processing started."`, `"Batch comparison started."`) tagged `success`** as if starting were the same as completing, when nothing has actually been achieved yet; and **a genuinely broken/interrupted state tagged `info`** because the code path that produced it isn't itself an "error" in the exception sense (see the "analysis was interrupted" example below). Check what the message text actually claims, not what code branch happens to set it.

*Worked example:* `EvalAnalysisSection.js`'s "analysis was interrupted before it finished" message used `variant="info"` — same as the volume-precheck messages right above it in the same file — but unlike those (an objective fact about the dataset, nothing to act on), this one represents a genuinely broken run with no completed report and exactly one way forward: re-run it. Fixed to `variant="warning"`. The precheck messages themselves were correctly left as `info` in the same pass — the two don't share the same reasoning even though they'd been bundled as one dismissible pair originally.

**Still a TODO:** this whole 4-variant system (colours, icon choices, the FA-vs-GcdsIcon split, spacing) was built code-first-accessibility-led, not through an actual design refinement pass yet — treat it as functional but provisional, not a settled design-approved pattern, until that review happens.

**`GcdsNotice` vs. `StatusMessage`: pick by whether the content changes.** `GcdsNotice`'s actual rendered markup is a plain `<section>` — no accessibility wiring anywhere (verified against its compiled source, `@gcds-core/components/.../gcds-notice.js`). That's fine for static, in-page content that's already there when the page loads (a permanent banner, a fixed disclosure) — nothing about it changes after mount, so nothing needs announcing. It's the wrong choice for anything that appears, disappears, or changes after mount: a `GcdsNotice` inserted into the DOM once some state flips gets zero announcement to screen-reader users — sighted users see a box appear, AT users get nothing. Use `StatusMessage` for that case instead; that's exactly what it's for.

*Worked example:* `App.js`'s session-about-to-expire warning (`sessionWarningVisible`) used `GcdsNotice`, appearing mid-session while the user was doing something else entirely on whatever page they were on — completely silent to AT the whole time this shipped, with no error and no test to catch it, same failure mode as a dropped prompt tag. Fixed by switching to `StatusMessage variant="warning"`. `LoginPage.js`'s session-expired notice had the identical bug, fixed the same way, plus an explicit focus-move (`useFocusOnChange`, and therefore `announce={false}`) since it's a one-time mount-time message explaining a redirect the user didn't initiate — same category as `ResetCompletePage.js`'s invalid-link case, not the ambient case `App.js`'s warning is.

*When not to migrate:* if the existing markup is too bespoke to fit `StatusMessage`'s message/`children` shape — a custom layout, not really "a message" — don't force it. Call `announce()` from an effect when its content changes instead. Only keep a hand-rolled `role="status"` on the element itself if that element is genuinely *always mounted* and only ever changes its content — see `AdminNotifications.js`'s pending-accounts panel, whose stat-list-plus-action-link layout doesn't map onto `StatusMessage` and which is rendered (empty) from first paint precisely so its later fill is a change, not an insertion.

**Full-page loading overlay is a separate component — `src/components/admin/LoadingOverlay.js`, not `StatusMessage`.** `StatusMessage`'s `loading` is general-purpose (any page might need an inline "still working" message) and lives here on purpose. `LoadingOverlay` is narrower — a full-page backdrop for when there's genuinely nothing else actionable on the page until the operation finishes (every other control is already disabled for the same duration anyway) — and stays in its own file for that reason, not because it's structurally different (it isn't; it announces its message through the same `useAnnounceOnChange` on mount). The original, narrower framing of this was "a dashboard's filter-driven fetch reloads" (still the most common case — `PartnerDashboard.js`, `PublicDashboard.js`, `ChatLogsDashboard.js`, `EvalDashboardPage.js`, `AutoEvalDashboardPage.js`, `ChatDashboardPage.js`), but the actual test is broader than dashboards or filters: `ScenarioOverridesPage.js` uses it for a single-department data load and for its Save/Revert actions, neither of which is a dashboard or a filter. If a page's controls are all disabled for a stretch and an inline `StatusMessage loading` is sitting next to them anyway, that's very likely a `LoadingOverlay` case instead — worth checking other pages for that same pattern opportunistically. Determinate progress (a known total, e.g. "chunk 3 of 10") isn't either of these — a third, different thing again — and doesn't belong in `StatusMessage` as a `progress` variant or in `LoadingOverlay` as a mode; see `ExperimentalAnalysisPage.js`'s `renderProgressCards` for the established pattern (a real `role="progressbar"` + a plain `role="status"` text line, its own small component). `loading` and `variant` inside `StatusMessage` are resolved through one lookup (`resolveLook`) rather than three separate hand-synced conditionals — that used to be the failure mode here: `loading` shipped with its content/className correct but its tag-forcing conditional not updated at the same time, so its spinner ended up nested inside an invalid `<p>`. The one-lookup structure is what makes `loading` and `variant` safe to keep in the same component; it's not something to re-split without a reason.

```jsx
import LoadingOverlay from '../components/admin/LoadingOverlay.js';

{loading && <LoadingOverlay message={t('some.page.loading')} />}
```

**Screen-reader-only outcome announcements.** Ask this whenever a change updates the screen **visually** with no other cue: *does anything else already tell a screen reader user this happened?* A native `<select>` announces its own new value; a `StatusMessage` box appearing announces itself. But some outcomes update the page with nothing else in the accessibility tree to notice — e.g. a debounced field auto-applying, a background probe finishing, a table re-filtering, an admin action's only feedback being a value elsewhere on the page changing. Those need an explicit announcement, or screen reader users get no signal at all that anything happened.

The pattern is one call — there's no invisible element to render:

```js
import { announce } from '../utils/liveAnnouncer.js';

announce(t('some.outcome.announcement'));
// assertive only for a genuine failure:
announce(t('some.failure'), { assertive: true });
```

Reference usages: `BatchList.js` (pause/resume, batch completions), `VectorPage.js` (stats loaded, probe results, backfill stopped), `ChatViewer.js` (log-level filter, initial-search success), `ConnectivityPage.js` (test-run summary). `hooks/admin/useSearchAnnouncement.js` wraps the same call for the dashboards' search-narrowing / "filters cleared" / "metrics loaded" announcements and also owns `zeroResultNonce` for the visible "no results" box. Don't render a `className="sr-only"` `StatusMessage` for this any more — that shape (and the `persistent`/`useSrAnnouncer` props/hook that went with it) is gone.

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
moved to it, the same way `AnnouncedError`'s callers get. The other case is a trigger that
*loses* focus: a Save button that disables itself mid-save drops focus to `<body>` in every
browser, so the outcome is where focus should land once it settles (`ScenarioOverridesPage.js`).
Don't solve either by switching the message to `AnnouncedError` just to borrow its
focus-move: `StatusMessage` already forwards `ref`/`tabIndex`, so give it its own
`useFocusOnChange(counter)` ref and `tabIndex={-1}` instead, driven by a counter dedicated to
that one trigger — not the same state any other, adjacent-to-their-trigger outcome on the
same page uses, which should stay focus-move-free per the default above. Two things that go
with it, both non-optional:

- **`announce={false}`** on that `StatusMessage`. Focus landing on it reads it; announcing it
  as well is a double read.
- **Drive the focus from the effect (the counter), not by calling `.focus()` in the same tick
  as the state update.** The message isn't in the DOM until the outcome has rendered, so a
  synchronous `ref.current?.focus()` right after `setStatus(...)` finds nothing.

See `ResetCompletePage.js`'s invalid-reset-link check and `ScenarioOverridesPage.js`'s
`saveFocusCount` for the two reference implementations.

The same rule already applies to the form-error family: `AnnouncedError` is always the
focus target, so it carries no `role="alert"`; `FeedbackInlineError` drops the role whenever
it's given an `inputRef` and keeps it only for the few uses nothing focuses (a per-field
error alongside a focused `ExplanationErrorSummary`). A focused element with a live role is
read twice.

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
`resolveErrorMessage` in `src/utils/errorCodeMessage.js` (`ResetCompletePage.js`'s own use of
it is the reference call site); or (2) if the raw detail itself is genuinely useful
to show, wrap only that portion in `<code lang="en">` inside an otherwise-translated
template, so AT pronounces it as English rather than mangling it with the page's own
language rules (`<code>` over a plain `<span>` — same `lang` behaviour, plus free monospace
styling from `global.css`'s bare `code {}` rule, and it's more semantically correct for a raw
technical detail) — see `DeleteChatSection.js`'s `resolveLook()`. A `t()` string with a
`{placeholder}` substituted via `.replace()`/interpolation is *not* equivalent to option 2:
`t()` returns a plain string, which can't embed an HTML element, so the substituted text has
no way to get `lang="en"` and stays unmarked either way.

**`{ prefix, suffix, detail, isError }` shape, specifically: use `useErrorStatus`, not a third
hand-rolled copy.** `DatabasePage.js` (~13 call sites) and `SettingsPage.js` independently
built the same combination of option 2 above with a translated template split around
`{error}` — extracted into `src/hooks/useErrorStatus.js` after the duplication was flagged in
review. `const { buildErrorStatus, renderStatusMessage } = useErrorStatus(t);` once per page;
`buildErrorStatus(key, error, otherPlaceholders)` takes the *raw* error object (not
`error.message`) so the `error.message || String(error)` fallback lives in one place, and
`renderStatusMessage(status, successVariant)` renders it (`successVariant` defaults to
`'success'`; pass `'info'` for an outcome that's a neutral confirmation rather than a
completed mutation — see `SettingsPage.js`'s cache-refresh use). Reach for this whenever a
page needs the prefix/suffix/detail shape; don't rebuild it inline again.
