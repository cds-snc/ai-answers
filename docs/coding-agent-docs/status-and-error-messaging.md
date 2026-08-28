# Status and Error Messaging

Read this before rendering any save/delete/import/export/test-run/upload outcome, autosave failure, loading state, sr-only announcement, or form validation error.

## `StatusMessage`

`src/components/admin/StatusMessage.js` renders every page/section-level outcome and general-purpose "still working" state. Don't hand-roll a `<div>`/`<p>`/`alert()` for these.

```jsx
import StatusMessage from '../components/admin/StatusMessage.js';

<StatusMessage variant="success" message={t('some.page.saved')} />
<StatusMessage loading message={t('some.page.loading')} />
<StatusMessage message={statusMessage?.text} isError={statusMessage?.isError} />   // pre-variant convention
```

- `message` of `null`/`undefined`/`''` renders nothing. `id` lets another element reference it via `aria-describedby`.
- `variant` (`error` | `warning` | `info` | `success`) builds the box class, icon, and announcement level (assertive for `error`, polite otherwise) from one prop. Box classes: `status-message--{error,warning,info,success}-box` in `admin.css` (GC DS tokens); icons `GcdsIcon warning-triangle`/`info-circle`, and FA `check-circle` for success (GC DS has no checkmark glyph). Boxes are `width: fit-content; max-width: 65ch`.
- Pass `children` instead of `message` when the content is richer than one string (a bullet list); you supply the icon. For a genuinely new outcome type, extend the `VARIANTS` map — don't add a page-local box class.
- `isError`/manual `className` still work for un-migrated callers; use `variant` for anything new.
- The 4-variant system was built accessibility-led without a design refinement pass — functional but provisional.

**Picking `info` vs. `success` vs. `warning` is about what actually happened, not whether the code path errored.**
- `info` — an objective fact the user didn't cause by completing something (a precheck result, a count, zero rows for a filter).
- `success` — a real completed action with an effect (saved, deleted, applied). "Processing started." is not `success` — nothing has been achieved yet.
- `warning` — broken, interrupted, or needs attention, even if no exception fired ("analysis was interrupted, re-run it" is `warning`, not `info`).

## How announcements reach a screen reader

**Every announcement goes through the always-mounted live regions in `src/utils/liveAnnouncer.js` — never through `role="status"`/`aria-live` on the message element.** The only live-region pattern every screen reader handles is text *changing inside a node already in the DOM*; a `role="status"` element inserted with its text in it is dropped by VoiceOver, and nothing fails — no error, no red test. The regions are created in `src/index.js` before React renders. `StatusMessage` and `LoadingOverlay` push their text to the announcer via `src/hooks/useAnnounceOnChange.js`; for an outcome with nothing visible, call it directly:

```js
import { announce } from '../utils/liveAnnouncer.js';
announce(t('some.outcome.announcement'));
announce(t('some.failure'), { assertive: true });   // assertive only for a genuine failure
```

Reference usages: `BatchList.js`, `VectorPage.js`, `ChatViewer.js`, `ConnectivityPage.js` (imported as `announceTestComplete`); `hooks/admin/useSearchAnnouncement.js` wraps it for the dashboards. The old `className="sr-only"` `StatusMessage` shape (and `persistent`/`useSrAnnouncer`) is gone.

Rules:

- **Don't add `role="status"`/`aria-live` to a message, box, overlay, or outcome.** A hand-rolled live region is only right on an element that is *always mounted* and only ever changes content (`AdminNotifications.js`'s pending-accounts panel, `ScenarioOverridesPage.js`'s test-link block, `ScenarioOverrideBanner.js`, `ChatAppContainer.js`'s sr-only chat region). Determinate progress announces its status line through `useAnnounceOnChange` (`ExperimentalAnalysisPage.js`'s `ProgressCard`). An element focus is moved onto gets no live region — focus reads it.
- **Don't add a repo-wide lint banning `role="status"`/`aria-live`** — the always-mounted exceptions make it noisy. The accessibility-review skill is the guard.
- **Ask "does anything else already tell a screen reader this happened?"** A native `<select>` announces its new value; a `StatusMessage` appearing announces itself. A debounced field auto-applying, a background probe finishing, a table re-filtering, a value changing elsewhere on the page — those need an `announce()`.
- **Data isn't an outcome.** `NoDataCard`s, chart placeholders, table contents are read by navigating to them. The page-level "no data for these filters" `StatusMessage` is the one announcement that case gets.
- **Repeat of an identical outcome** (save twice, second zero-result search): pass a changing `nonce` to `StatusMessage`. `useRepeatableStatus()` (in `StatusMessage.js`) owns the `message`+`nonce` bookkeeping (`ChatOptions.js`, `ChatViewer.js`). VoiceOver can still skip an identical sentence it just read, so put something that varies in a repeatable message ("No results for {term}.") or word adjacent actions' outcomes differently.
- **"Loading…" is skippable.** `LoadingOverlay` and `StatusMessage loading` announce with `skippable: true` — a short grace, then dropped if the result arrives first. Use `skippable` for in-progress states, never outcomes.
- **Every dashboard ends a fetch with "Results loaded." (`admin.common.resultsLoaded`, assertive) when there is data, nothing when there is none** — the visible "no data" `StatusMessage` announces the empty case itself with `assertive`. Hook-driven fetches use `useResultsLoadedAnnouncement({ loading, count, t })`; DataTables callbacks use `useSearchAnnouncement`'s `noteLoadResult(count)` or `announce()`. Don't add a per-dashboard "X loaded" string. `assertive` on a non-error `StatusMessage` is for a completion the user is waiting on, not ordinary confirmations.
- **A message that appears mid-typing is announced late.** Render it with `announce={false}` and `announce()` it from a delayed, cancellable effect (`SettingsPage.js`'s unsaved-changes warning).
- **If focus is moved onto the message, pass `announce={false}`.** Focus reads it; announcing too is a double read.
- **Client-side route changes announce the page title** (`usePageMetadata` from the route's `titleKey`) alongside `useRouteChangeFocus`'s focus-to-`<main>`. Don't add a per-page opt-out for a `navigate()` destination. Announce an in-progress state before a slow navigating action (`LoginPage`'s "Signing in…") — the disabled submit drops focus, so its label change isn't heard.
- **Announcements clear after ~10s** so stale text doesn't sit in the accessibility tree.

**Testing:** `test/liveAnnouncer.js`'s `waitForAnnouncement(text, 'polite' | 'assertive')`. Don't use `findByRole('alert')`/`getByRole('status')` — the only elements with those roles are the site-wide regions, and an early query finds them empty. Assert the visible box by class (`.status-message--error-box`) or text. `test/vitest-hooks.js` excludes the regions from `*ByText` and resets the announcer between tests. To unit-test without the DOM, `vi.mock` `liveAnnouncer.js`'s `announce` (`StatusMessage.test.js`).

## Public chat UI is a separate model (`src/components/chat/`)

The live conversation has its own small, self-contained announcement and focus system, tuned and validated with screen-reader users. It stays separate on purpose — it's easy to maintain as is — so don't migrate it onto `StatusMessage`/`announce()`, and don't copy its patterns out to admin pages.

- **Its own live regions.** `ChatAppContainer.js` keeps an always-mounted `role="status"` region (`ariaLiveMessage`) and a `role="alert"` for errors. Backend progress is throttled to about one announcement per 4s with a "still working" fallback; the "AI can make mistakes" disclaimer rides in the loading container's `aria-label`. Chat status never goes through `announce()` or a `StatusMessage`.
- **Its own focus lifecycle** (`ChatInterface.js`): loading starts → focus the loading container (the textarea is disabled, so focus would drop); loading ends → focus the error if there is one, else the new AI message so it reads in document order. The textarea autofocuses on load — intentional, validated; don't propose removing it.
- **Field errors are shared.** `FeedbackInlineError`, `ExplanationErrorSummary` and `useInlineFormError` live under `components/chat/` and serve both the public feedback forms and admin pages.
- **Admin chrome inside review mode** (`ChatOptions`, expert-feedback outcomes; `ScenarioOverrideBanner` is one of the always-mounted regions above) is admin tooling: it uses `StatusMessage`/`announce()` and reads in the admin's UI language, not the transcript's `lang` (see [official-languages.md](official-languages.md)).

## `GcdsNotice` vs. `StatusMessage`

`GcdsNotice` renders a plain `<section>` with no accessibility wiring. Use it only for static content already there at page load (a permanent banner). Anything that appears, disappears, or changes after mount is `StatusMessage` — a `GcdsNotice` inserted on a state flip is silent to AT (`App.js`'s session-expiry warning and `LoginPage.js`'s session-expired notice both shipped that way; both now `variant="warning"`).

If existing markup is too bespoke for `StatusMessage`'s message/`children` shape, don't force it — call `announce()` from an effect when its content changes.

## Loading states

- **`StatusMessage loading`** — inline "still working" for a single page-level state (`SessionPage.js`, `BatchUpload.js`).
- **`LoadingOverlay`** (`src/components/admin/LoadingOverlay.js`) — full-page backdrop for when nothing else on the page is actionable until the operation finishes: the filter-driven dashboards, and `ScenarioOverridesPage.js`'s data load and Save/Revert. If a page's controls are all disabled for a stretch with an inline `StatusMessage loading` beside them, it's probably this. Same `useAnnounceOnChange` as `StatusMessage`; separate file because it's narrow, not structurally different.
- **Determinate progress** ("chunk 3 of 10") — neither of the above: a real `role="progressbar"` plus a status line, its own small component (`ExperimentalAnalysisPage.js`'s `renderProgressCards`).

```jsx
{loading && <LoadingOverlay message={t('some.page.loading')} />}
```

`loading` and `variant` in `StatusMessage` resolve through one lookup (`resolveLook`) — keep it that way; hand-synced conditionals are how `loading`'s spinner once ended up inside an invalid `<p>`.

## Moving focus to a `StatusMessage`

`StatusMessage` doesn't move focus by default — most callers render it beside the trigger, so the announcement is enough. Two cases need focus moved:

- **No adjacent trigger** — a check on mount (an invalid/expired link: `ResetCompletePage.js`).
- **The trigger loses focus** — a Save button that disables itself drops focus to `<body>` (`ScenarioOverridesPage.js`'s `saveFocusCount`).

Give the `StatusMessage` its own `useFocusOnChange(counter)` ref and `tabIndex={-1}`, driven by a counter dedicated to that one trigger — don't switch it to `AnnouncedError` to borrow its focus-move, and don't share the counter with other outcomes on the page. Two non-optional companions: `announce={false}`, and drive focus from the effect, not a synchronous `.focus()` after `setStatus(...)` (the element isn't rendered yet).

The form-error family follows the same rule: `AnnouncedError` is always the focus target, so it has no `role="alert"`; `FeedbackInlineError` drops the role whenever it's given an `inputRef`.

## Form-field errors

`StatusMessage` is not a forms component. A validation error tied to one field uses the form-error family, which wires the error to its field via `id`/`aria-describedby` and moves focus on submit failure:

- **`src/components/chat/FeedbackInlineError.js`** / **`src/components/auth/AnnouncedError.js`** — one message for one thing (a field's error; a page-level auth/system error).
- **`src/components/chat/ExplanationErrorSummary.js`** — a GC DS `gcds-error-summary`-style box (heading + jump-links) for *several* invalid fields at once (`SettingsPage.js`, `ExpertFeedbackComponent.js`). Not for a single error.

**`FeedbackInlineError` needs `errorCount`, or repeat identical failures go silent.** It renders `<p key={errorCount} role="alert">`; the `key` forces a fresh node on every trigger. With plain `useState` + `setError(text)`, two submits with the same invalid input produce the same string, React bails on the update, and the second failure is never announced. Use `src/hooks/useInlineFormError.js`:

```jsx
const { hasError, errorCount, errorRef, triggerError, clearError } = useInlineFormError();
// invalid submit: triggerError();   valid input: clearError();
{hasError && <FeedbackInlineError id="my-field-error" message={t('my.field.error')} errorCount={errorCount} inputRef={errorRef} />}
```

If the error text varies per failure, `useState` is fine but `errorCount` still comes from a counter, not the text. `FeedbackInlineError` renders **above** the field it describes (`SettingsPage.js`'s `SettingsTextArea`).

**Prefer rejecting the interaction over disabling the control when the reason needs explaining.** A `disabled` element leaves the tab order, so an `aria-describedby` hint on it is never reached. Keep the control enabled, let the interaction happen, and surface the problem with `useInlineFormError`/`FeedbackInlineError` from the control's own handler (`ScenarioOverridesPage.js`'s "use this scenario for testing" checkbox). A control disabled for a self-evident reason (Save with nothing typed) is fine.

## Raw error text

**Never show a raw `err.message`/`error.message` directly to the user.** It's untranslated English from a JS `Error`/`fetch()` rejection, often irrelevant. `err.message || t('fallback')` doesn't help — `.message` is always truthy. Two alternatives:

1. **A stable backend `code`, not free text**, mapped to a `t()` key via `resolveErrorMessage()` (`src/utils/errorCodeMessage.js`; `ResetCompletePage.js` is the reference).
2. **Wrap the raw detail in `<code lang="en">`** inside an otherwise-translated template when the detail is genuinely useful (admin/diagnostic tooling): AT pronounces it as English and `global.css`'s `code {}` gives monospace for free. See `DeleteChatSection.js`'s `resolveLook()`. A `t()` string with `.replace('{placeholder}', …)` is *not* equivalent — a plain string can't carry `lang="en"`.

**For the `{ prefix, suffix, detail, isError }` shape, use `src/hooks/useErrorStatus.js`**: `const { buildErrorStatus, renderStatusMessage } = useErrorStatus(t);` once per page. `buildErrorStatus(key, error, otherPlaceholders)` takes the raw error object; `renderStatusMessage(status, successVariant)` renders it (`successVariant` defaults to `'success'`; pass `'info'` for a neutral confirmation). `DatabasePage.js` and `SettingsPage.js` use it — don't rebuild it inline.

**Interpolating dynamic text into a translated template:** don't pass it as the 2nd argument of `String.replace` — that's a replacement *pattern*, and a `$` in the text (`$&`, `` $` ``, `$$`) corrupts the message. Use the function form: `.replace('{message}', () => error.message || String(error))`.
