---
name: accessibility-review
description: Review the pending diff (or a named page/component) for WCAG 2.1 AA accessibility issues — semantic HTML, ARIA, keyboard navigation, focus management, colour contrast, forms, and screen-reader behaviour. Use before merging any UI-touching change, or when the user asks for an accessibility/a11y review.
---

# Accessibility review

This app is a Government of Canada public-facing service. It must meet
**WCAG 2.1 AA** (the GC baseline) in both English and French. Treat that as
the bar for every finding, not "best practice."

## Scope

There are four modes. Infer which one from the request; ask if it's
ambiguous whether "everything" means the diff or the whole app.

- **Diff review (default)** — `git diff` against the base branch, UI code
  only (`src/pages/`, `src/components/`, `src/hooks/`, CSS). If the diff
  touches only non-UI code (API, services, agents, prompts), say so and skip
  the review rather than forcing findings. **New vs. pre-existing:** an
  issue in code the diff *adds or changes* is blocking — new features must
  pass the checklist before merge. An issue in code the diff merely
  *touches* (a line near the change, but the defect itself predates this
  PR) is not this PR's job to fix — call it out as a `// TODO(a11y):` (or
  equivalent tracked note) pointing at the WCAG criterion, rather than
  blocking the PR on unrelated pre-existing debt, unless the fix is trivial
  enough to bundle in. Say explicitly which findings are which.
- **Targeted review** — the user names a specific page/component/route.
  Read the named file in full, then recursively follow its own imports into
  every shared component, hook, and util it actually renders or calls
  (`FilterPanel.js`, `StatusMessage.js`, shared DataTables helpers, etc.) —
  apply the full checklist (Sections 1-8) to those too, not just the named
  file's own JSX. A bug in a shared component is a bug in every page that
  targets it; scoping to "just this page" without checking what it
  consumes is how shared-component bugs go unnoticed. If a finding turns up
  in a shared file, apply the "propagate confirmed anti-patterns" rule (see
  Full app audit) even for an otherwise-targeted review — grep the rest of
  the app for that shared file's other consumers and note them, since they
  inherit the same bug.
- **Full app audit** — triggered by phrasing like "audit everything",
  "whole app", "full accessibility audit", or an explicit `full` arg, and
  by named-area shortcuts (see below). Covers every route in scope, not
  just what changed. See below.
- **Audit re-verification / update** — triggered by "update the audit",
  "is this still accurate", "re-check against main", or asking to refresh a
  previously-published audit artifact. Different task from a full audit and
  from a diff review — see below. **Do not treat this as "diff review of the
  audit artifact's own claims."** It must re-examine the actual application
  code, not just the doc's bookkeeping.

### Full app audit

This is a large task — confirm scope with the user before starting if it's
not obvious (e.g. "just public-facing pages, or admin/partner tools too?").

**Named-area shortcuts** — the audit doesn't have to mean literally every
route; the user can scope it to a named area, checked against
`roles`/`RoleProtectedRoute` in `src/App.js`:

- **"public chat"** — `HomePage.js` + `src/components/chat/*` only. This
  area has its own completed, passed audit as of this doc's last update —
  confirm with the user that they actually want it re-audited (cost) rather
  than assuming stale.
- **"auth" / "staff account"** — Login/Register/Logout/ResetRequest/
  ResetVerify/ResetComplete/About/HowTo/404 — no `roles` restriction on the
  route itself, but these are **not public-user pages**: this app has no
  public account system at all. The public only ever interacts
  anonymously through the chat UI (`HomePage.js` +
  `src/components/chat/*`, the separate "public chat" area above) — no
  login, no account. Login/Register/reset-password exist solely for GC
  staff (admin/partner) accounts; "unauthenticated route" here means
  "the page you hit *before* staff auth," not "public-facing."
- **"admin"** — means **everything behind auth**, not just `AdminPage.js`
  and its immediate children. Every route in `src/App.js` carrying a
  `roles` array (`['admin']` or `['admin', 'partner']`) is in scope:
  dashboards, chat/session/batch tooling, eval tooling, admin utility
  pages, experimental tooling, and the partner-shared pages below. Don't
  narrow this to literally the admin shell page unless the user says so.
- **"partner"** — the subset of the above where `roles` includes
  `'partner'` (e.g. ChatDashboardPage, AdminPage shell, BatchPage,
  ChatViewer, EvalDashboardPage, PublicEvalPage, Metrics/PublicDashboard/
  PartnerDashboard/TechnicalMetrics, ScenarioOverridesPage). Partner is a
  *role*, not a separate set of pages — most partner-visible pages are
  shared with admin, just narrower (e.g. Users/Settings/Database/Vector/
  Connectivity/Sessions/AutoEvalDashboard/EvalPage are `['admin']`-only and
  excluded from a partner-scoped audit).
- **"experimental"** — `src/pages/experimental/*` + `src/components/experimental/*`.

If none of these match what was asked, fall back to enumerating the full
surface per step 1 below.

1. Enumerate the surface: read `src/utils/routes.js` for the full
   `ROUTE_SLUGS` list, then map each route to its page component in
   `src/pages/`. Include admin/partner-only routes unless told otherwise —
   they're still subject to WCAG 2.1 AA.
2. Group pages by shared components (e.g. several pages rendering the same
   form or table) so shared components are reviewed once, not once per page
   that uses them — note the shared component and every page it affects
   instead of duplicating the same finding per page.
3. This will not fit in one pass of context. Delegate page groups to
   parallel `Explore`-or-`general-purpose` agents (background, one per
   logical group of ~3-6 pages), each given this skill's checklist (Sections
   1-8 above) and told to report findings in the file/line/WCAG-criterion/fix
   format from "How to review" below. Don't have them fix anything —
   audit-only.
4. Aggregate all agent findings yourself, dedupe anything that's really the
   same shared-component issue reported multiple times, and sort
   most-severe-first per the severity ordering below.
5. Given the likely volume, present the aggregated result as an Artifact
   (a scannable report grouped by page/component with severity, WCAG
   criterion, and fix) rather than a long chat wall of text — offer this,
   don't assume it.
6. **Propagate confirmed anti-patterns across the whole codebase, not just
   the file where you found them.** Once a finding is verified as real (not
   assumed), `grep` the rest of the in-scope surface — and ideally the whole
   repo, noting anything found outside the requested scope even if it isn't
   logged as an in-scope finding — for the same code shape before moving on.
   Example from this app's history: a redundant `tabIndex="0"` on
   `<GcdsDetails>` (it already renders its own focusable toggle, so this
   just inserts a dead extra tab stop) was correctly caught in one page but
   missed in two others using the identical pattern, because each file was
   reviewed independently with no cross-file pattern search once the bug
   was confirmed. A per-file line review will not surface this on its own.

### Audit re-verification

Two **separate, independently-triggerable requests**, not one bundled task —
running both together is expensive and usually more than the user asked for.
Ask which one is wanted if it's ambiguous ("update the audit" on its own
usually means Request A only). The failure mode this section guards against
isn't "not knowing WCAG" — it's silently trusting old conclusions instead of
rereading the code:

- An "updated" pass once re-verified whether previously-*logged* findings
  were fixed (checking PR diffs against claim text) but never re-scanned
  already-in-scope files for genuinely new code that had landed since the
  last pass — so a new feature added to an already-audited file, one day
  after the first pass, sat un-flagged through a second pass that claimed
  to have re-checked that same file.
- A long-standing, pre-existing behaviour (autosave triggered on every
  keystroke, no explicit confirm) went unflagged for months across every
  pass, because no version of the checklist asked the SC 3.2.2 question at
  all (see the new Forms bullet above) — the file-by-file review had a
  category-level blind spot, not just a coverage gap. Only Request B below
  would ever have caught that; Request A cannot, by design.

**Request A — revalidate the work in progress.** Cheaper, faster. Walk the
existing audit's own scope: every finding it logged (open or fixed) and
every file/pattern it already tracks. For each, re-verify against current
`main` — is it still accurate, still open, actually fixed, or has the
surrounding code moved out from under it? This is bookkeeping hygiene: it
keeps the existing document honest, but it cannot surface anything the
original audit never saw in the first place. Trigger phrases: "update the
audit," "is this still accurate," "re-check the findings against main."

**Request B — recheck the whole audit against changes since it was first
made.** More expensive, treat it as closer in cost to a fresh full audit.
Independent of what the audit document says, re-run the actual checklist
(Sections 1-8) over the audit's full declared scope (every route and shared
component it claims to cover, per "Full app audit" above), specifically
targeting what's changed since the audit's first pass: new code added to
already-covered files (drift — rule 1 below) and categories of problem the
checklist itself didn't have language for last time (a blind spot doesn't
show up in a diff, so this can't be scoped to "just the diff" — see rule 2).
Trigger phrases: "recheck against changes since it started," "full drift
check," "re-audit for anything new." Confirm with the user before starting
given the cost, same as a fresh Full app audit.

Rules — apply whichever of A/B was actually requested:

1. **Re-read in-scope file content — don't diff against the audit doc's own
   claims.** For each file the existing audit covers (findings *and* things
   marked clean), run `git log --oneline <since-last-audit-date>.. -- <file>`
   to see if *anything* landed in it since the last pass, independent of
   whether a tracked PR touched it. If yes, read the current file in full
   against the whole checklist (Sections 1-8) — not just the lines related
   to the tracked finding. A file being "already audited" is not a reason to
   skip new code inside it. (Request B only, since Request A is scoped to
   already-tracked findings.)
2. **Don't assume new-looking code is new.** Before writing off a finding
   as "this is new code that arrived after the audit, not a miss," check
   when it actually landed (`git log -1 --format=%ad -- <file>` or
   `git log -S"<anchor string>" -- <file>`) against the audit's own pass
   dates. Code that landed between two passes — even one day after the
   first — was in scope for the later pass and should be treated as a
   miss, not excused as out-of-window.
3. **Verify claims against current file content, not against whether a
   tracked PR merged.** "PR #1234 merged" is not proof a specific finding
   is fixed — re-read the actual lines. PRs get scope trimmed, rebased, or
   split before landing; a finding attributed to a PR can be absent from
   what actually merged.
4. Apply the "propagate confirmed anti-patterns" step from Full app audit
   above — Request B is exactly when a pattern fixed in one file during the
   interim is most likely to still be lurking, unflagged, in a sibling file.
5. Record what was actually re-checked vs. carried forward unverified, per
   finding — don't let a doc's confidence silently outrun what was actually
   re-read this pass. State plainly at the end which of A/B this was, so a
   future pass doesn't mistake a Request A refresh for a full Request B
   drift check.

## What to check

Go file by file. For each changed component/page, check against these
categories — skip categories that plainly don't apply (e.g. a table page has
no form-validation surface).

### 1. Semantic HTML & structure
- Real elements over ARIA-patched `<div>`s (`<button>` not `<div onClick>`,
  `<nav>`, `<main>`, list markup for lists, etc.).
- Heading hierarchy is sequential (no skipped levels) and there is exactly
  one `<h1>` per page.
- Landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`) aren't duplicated or
  missing on page-level components.
- The skip-to-main-content link (or equivalent bypass mechanism, SC 2.4.1) is
  reachable early in DOM order — check what sits ahead of it, not just that
  it exists. Easy to miss when the skip link lives in a third-party
  component's shadow DOM (e.g. `GcdsHeader`'s `skipToHref`); the check is DOM
  order of the host markup around it.
- **An element chosen for its default styling, not what it actually means,
  is still wrong even when nothing points at it as broken yet.** The
  giveaway: the element carries no real relationship the tag implies —
  `<label>` with no `for`/wrapped control (labelable elements only work with
  form controls; a `<button>` group has none), `<button>` with no click
  handler used purely for its reset-style default appearance, `<a>` with no
  `href` kept only for cursor:pointer. This is decidable from the code alone
  — check what the tag is *supposed* to relate to and confirm that
  relationship actually exists, don't wait for a symptom to surface it.
  Left in place, this class of mismatch tends to surface later and
  confusingly once the element becomes a focus target or gets a live-region
  role added — e.g. a `<label>` wrapping a preset-button group's caption
  (kept only for its existing text styling) produced WebKit's AXGroup/
  "empty" accessibility-tree behaviour only once something else made it
  focusable, which read as a focus-management bug rather than the actual
  root cause (wrong element, unrelated to what changed). Verify the fix is
  free: check whether the *class* the element carries is a class selector
  (`.foo`) rather than a tag-qualified one (`label.foo`) before assuming a
  same-line tag swap (e.g. `<label>` → `<p>` or `<span>`) is safe — it
  usually is, but confirm rather than assume. When found, apply the
  "propagate confirmed anti-patterns" step (see Full app audit) — grep for
  the same tag-for-styling shape elsewhere before moving on, the same way
  the `tabIndex="0"` example there was found in more than one file.

### 2. Keyboard navigation
- Everything clickable is reachable and operable via keyboard alone (Tab,
  Shift+Tab, Enter/Space, Esc for dismissible UI, arrow keys for
  radio/tab/listbox groups).
- Tab order follows visual/reading order — no `tabindex` > 0 hacks.
- No keyboard traps (modals, custom dropdowns must release focus on close).
- Custom interactive components (accordions, tabs, comboboxes) follow the
  matching ARIA APG pattern's keyboard model, not just click handlers.

### 3. Focus management
This codebase has an established pattern for this (see the recent
`fix: error message focus management` / `fix: feedback form error focus`
commits) — check new code follows it rather than reinventing it:
- On validation error, focus moves to the error summary/first invalid field.
- On dynamic content changes (route change, modal open/close, async content
  swap), focus moves somewhere sensible and isn't silently lost to `<body>`.
- **A real page load and a client-side `navigate()` are not equivalent —
  don't let a link-based route change hide a `navigate()`-based one.** Any
  internal link rendered as a real `<a href>`/`GcdsLink` triggers a genuine
  browser navigation: the browser resets focus and reads the new `<title>`
  on its own, no app code required. `navigate()` from `useNavigate()` does
  neither — it's a client-side `pushState` transition with no browser-native
  focus reset and no title announcement. Grep for `useNavigate`/`navigate(`
  to enumerate every call site; each one needs its own (or a shared,
  centrally-wired) focus-management story, not an assumption that "it's just
  routing, the browser handles it" — that's only true for the `<a href>`
  case. Check the `location.key` vs `location.pathname` distinction too: a
  transition that only changes a query string (e.g. `?chat=...`) still needs
  to be caught — a pathname-keyed effect silently never fires for it.
- **Each distinct page needs its own `document.title` (SC 2.4.2, Page
  Titled).** If every route shares one generic app-wide title (or only a
  handful of pages set their own while the rest fall through to a shared
  default), that's a real, reportable finding — not just for screen readers:
  indistinguishable browser tabs and identical bookmark names are the
  sighted-user symptom of the same gap. Prefer reusing each page's existing
  `<h1>`/heading locale key over a new duplicate title string, so the two
  can't drift apart.
- For every dismiss/clear/toggle/remove-style control, check whether its own
  `onClick` **— or an effect that reacts to a prop/state change and closes,
  collapses, or unmounts the currently-focused control from underneath the
  user (an auto-close-on-success effect is just as capable of this as a
  direct click handler, and easier to miss since there's no click to trace
  from)** — changes state that the control's *own* render condition depends
  on — a conditional `{x && <Control/>}`, a ternary swapping it for
  something else, or a style/class change like `display: none`. If so,
  explicit focus redirection is required in that same handler (or a
  `useEffect` keyed to the same state) — don't assume a general "focus
  dropped to `<body>`" finding already covers every instance of this in a
  file just because one instance was found and fixed nearby. Check each
  control independently: a "Clear all" button, an individual pill's own
  remove button, and a search-clear pill can each have this bug
  independently even inside the same component.
- Focus is visible — never `outline: none` without a replacement that meets
  contrast requirements (GC DS focus tokens, e.g. `var(--gcds-focus-border)`,
  already provide this — flag any custom override that suppresses it).
- **A focus-restoration mechanism that removes the interacted-with content
  entirely (not just re-renders it) needs its own explicit fallback target —
  don't assume the general remount-consumption path covers this case too.**
  A common shape: click a control → arm a ref/flag with the clicked item's id
  → a later redraw/remount consumes it and refocuses. This works when the
  item survives the redraw (edited, reordered, status-changed). It
  structurally cannot work when the action's own *success* removes the item
  from the next render (a delete, a dismiss that also deletes) — nothing
  ever redraws that id again, so the consuming side never fires and focus
  drops to `<body>`. This is decidable from the code: find the success path,
  confirm whether the item is still present in the data the next render
  works from, and if not, confirm a *different*, explicit redirect exists
  for that specific branch (e.g. a nearby always-mounted control) rather
  than reusing the generic redraw-consumption logic. Real example: a delete
  handler's `finally` block still called the shared re-fetch, and the
  reviewer's first pass confirmed *a* button gets focused after Process/
  Cancel — but never separately checked delete's own success path, where the
  row genuinely never comes back.
- **When a focus-restoration mechanism picks a target by querying "the first
  interactive element" rather than the specific one that was clicked, check
  whether that set's order or membership can vary.** `querySelector('button,
  [tabindex]')`-style fallbacks silently refocus the *wrong* control whenever
  the clicked item isn't reliably first — e.g. a row's action buttons differ
  by status (Cancel before Delete in one branch, Delete alone in another), so
  clicking Delete and having it fail can land focus on Cancel instead. This
  is a real, reportable imprecision distinct from "focus dropped to body" —
  it doesn't fail SC 2.4.3 outright (focus *did* move somewhere sensible-
  looking) but it's the wrong somewhere, confusing for a keyboard/AT user who
  clicked one specific thing. Look for whether the restoration mechanism
  tracks *which* action was clicked (a key/id alongside the item id) or only
  *that* something was clicked — the latter is the tell.
- **A focus redirect issued from a handler running in one React root can
  lose a real timing race against self-focusing content in a *different*
  React root**, if that content is mounted via its own `createRoot`/manual
  `root.render()` (a common pattern for cell-level renders inside a
  non-React table library like DataTables). The separate root's own commit
  is scheduled independently — a synchronous `.focus()` call issued from an
  async callback elsewhere can execute *before* that commit lands, and then
  the other root's self-focusing element (e.g. a "Processing…" placeholder
  with its own focus-on-mount ref) steals focus right back immediately
  after. Symptom: a redirect that appears to work when traced through the
  code, but doesn't hold in a running app or a real test — the target
  briefly receives focus, then loses it. Not reliably catchable by reasoning
  about microtask order alone (a second, third microtask tick doesn't fix
  it) — the redirect needs to run *after* the other root's commit, which
  generally means a macrotask (`setTimeout`), not another `await`/`Promise.
  resolve()`. Flag any synchronous or microtask-deferred focus redirect that
  competes with a separately-rooted self-focusing element as `Needs
  validation:` at minimum, and as a real finding if a quick trace confirms
  the other root's commit isn't already guaranteed to have landed first.

### 4. ARIA usage
- ARIA attributes are used to *supplement*, not replace, semantics — flag
  any case using ARIA to fix something a native element would solve for free.
- Every `aria-*` reference (`aria-labelledby`, `aria-describedby`,
  `aria-controls`) points to an ID that actually exists in the rendered DOM.
- Live regions (`aria-live`, `role="alert"/"status"`) are used for dynamic
  content that needs to be announced (errors, async results, loading state)
  — and not overused to the point of announcement spam.
- A live region announces a *change*, not a value. If a message is driven
  by state with no mechanism to force a remount on a repeat identical
  trigger, React bails on the no-op update and the second (and every later)
  occurrence goes silently un-announced — this is decidable from the code,
  not a maybe: report it as a real finding (SC 4.1.3) when the mechanism is
  missing. `StatusMessage`'s `persistent` messages carry a `nonce` prop for
  exactly this; check it's used wherever the same outcome could plausibly
  repeat. Reserve `Needs validation:` (see "How to review") for what you
  genuinely can't trace — a reset happening in a code path you can't
  follow, or actual AT-timing behavior — not for this.
- **Check *how* a repeat-trigger mechanism forces the re-announcement, not
  just that one exists.** Folding a changing value into the rendered
  element's own `key` (forcing React to destroy the node and mount a fresh
  one) technically produces a DOM mutation, but a freshly-created node is a
  fresh *insertion* with its text already inside it — exactly the
  "populated on insertion" failure mode `persistent` exists to prevent,
  self-inflicted by the mechanism meant to make repeat announcements *more*
  reliable. This is a real, reportable finding on its own (SC 4.1.3), not
  satisfied just because *a* mechanism is present. Confirm the fix is a
  genuine in-place mutation on the *same* node (e.g. a real state change
  that alters visible text, not a `key` swap) — a test asserting node
  identity is unchanged across the trigger (not just that the right text
  eventually renders) is the way to actually verify this from a diff.
- **When the same live-region pattern is duplicated across multiple
  sections/tabs/instances of one page (one `StatusMessage` per list, per
  panel, per filter group), check whether the `nonce`/remount-forcing
  counter is scoped per-instance or shared globally across all of them.** A
  shared counter means an unrelated change in instance A still bumps the
  counter instance B's `key`/`nonce` reads too, forcing B to remount even
  though its own content never changed — and a remount with content already
  populated is exactly the "fresh insertion" pattern AT generally
  re-announces, so B's stale, already-heard message gets spoken again for no
  reason tied to anything the user just did. This is decidable from the
  code: find every place the nonce state updates, and confirm each `<Status
  Message nonce={...}>` call site reads a value that only changes when
  *that* call site's own message does. Report as a real finding (SC 4.1.3)
  when a single counter/state variable feeds more than one independently-
  positioned live region.
- No redundant/conflicting roles (e.g. `role="button"` on an actual
  `<button>`).

### 5. Forms
- Every input has a programmatically associated label (`<label for>`,
  `aria-label`, or `aria-labelledby`) — not just placeholder text.
- Required fields are marked both visually and programmatically
  (`required`/`aria-required`).
- Error messages are associated with their field (`aria-describedby`) and
  announced (see Focus management above), not conveyed by colour alone.
- Repeat identical validation failures still get announced. A field error
  set via plain `useState` with no changing counter goes silent on a second
  identical failure — the same DOM-no-op problem as live regions above.
  `FeedbackInlineError` needs a changing `errorCount` (`useInlineFormError.js`;
  see AGENTS.md's "FeedbackInlineError needs errorCount") to force a remount
  on every trigger, not just the first.
- Radio/checkbox groups have a group label (`<fieldset>`/`<legend>` or
  `role="group"` + `aria-label`).
- **Persisted changes need an explicit trigger, not just an announcement.**
  If typing/selecting alone (no Save/Submit click) commits a change to the
  server — save-per-keystroke, save-on-blur with no undo — that's a
  candidate SC 3.2.2 (On Input) failure: a change of state the user didn't
  explicitly ask for, and nothing in the UI advised them it would happen
  automatically. This is a **separate finding from SC 4.1.3** (was the
  change announced?) — an autosave that announces itself perfectly is still
  a 3.2.2 problem if there's no way to review/confirm before it's
  committed, and fixing the announcement does not fix this. Flag both
  independently; don't let one absorb the other. Prefer explicit
  save-on-demand with dirty-state tracking (stage changes locally, commit
  on a real Save action) over autosave-on-input for anything consequential
  (settings, redaction rules, anything hard to undo).

### 6. Colour & contrast
- Text and meaningful icons meet 4.5:1 (normal text) / 3:1 (large text, UI
  components) against their background — check any new custom colour against
  GC DS tokens (`docs/coding-agent-docs/design-system.md`) rather than
  eyeballing it.
- Colour is never the *only* signal for state (error, success, required) —
  there's always a text/icon/shape cue alongside it.
- **Verify the class actually exists before trusting its computed colour.**
  This project has no Tailwind dependency, but Tailwind-style class names
  (`text-red-600`, `bg-red-50`, `gap-2`, `rounded`, `p-2`, …) still show up
  copy-pasted in — grep `src/styles/*.css` for the class before estimating
  its contrast. An undefined class isn't a contrast failure at the value it
  implies; it's unstyled/default-rendered, often a worse and different bug
  (missing padding/background/icon sizing, not just a bad colour). Flag it
  as "undefined class, not a real style" and point at the nearest real
  pattern to reuse (see design-system.md) rather than reporting a computed
  ratio for a rule that was never applied.

### 7. Images & non-text content
- Meaningful images have real `alt` text; decorative images have `alt=""`
  (not omitted).
- Icon-only buttons/links have an accessible name (`aria-label` or visually
  hidden text) — check both language variants.
- **A decorative glyph drawn via CSS `content` (`::before`/`::after`,
  e.g. `content: '►'` for a disclosure chevron) is not automatically
  invisible to AT the way a background image is.** Modern browser/AT
  pairings (Chrome+NVDA/JAWS, Safari+VoiceOver) expose `content`-generated
  *text* to the accessibility tree — a decorative character rendered this
  way gets read aloud alongside the element's real label, adding noise to
  every instance app-wide if the pattern is shared (e.g. every
  `<details>/<summary>`). Grep CSS for `content: '<char>'`/similar Unicode
  glyphs on pseudo-elements of interactive controls; the fix is a CSS mask
  (`mask-image`/`-webkit-mask-image` + `background-color: currentColor`) or
  an actual `aria-hidden` image, not literal text `content`.

### 8. Bilingual/i18n interaction with accessibility
- `lang` attribute correctness isn't broken by the change (page-level `lang`
  should match the active locale).
- New a11y-relevant strings (aria-labels, alt text, error announcements) go
  through `t()` with entries in **both** `en.json` and `fr.json` — same rule
  as all user-facing text in this repo, but easy to miss for attributes that
  aren't visibly rendered text.
- **Raw/dynamic runtime text substituted into an otherwise-translated
  message still needs its own `lang="en"` wrapper — a translated sentence
  around it doesn't cover it.** An exception message, HTTP status/status
  text, or raw backend error detail is always English (or whatever the
  underlying system emits), regardless of the surrounding `t()` copy's
  locale — on a French page, a French screen reader hits that raw span and
  mispronounces it under French phonetic rules. Look for any place a
  translated template concatenates or interpolates a live JS value
  (`${error}`, `.replace('{error}', ...)`, `{error.message}`, an HTTP
  `status`/`text`) with no `<code lang="en">…</code>` (or `<span
  lang="en">`) around just that substituted part — `t()`-wrapping the
  surrounding sentence is not sufficient on its own. This is a systemic
  pattern worth a repo-wide grep once one instance is confirmed (see
  "propagate confirmed anti-patterns" in Full app audit), not just a
  per-file eyeball — a single pass here previously turned up the same
  unwrapped-raw-text gap independently in ~10 unrelated files.

## How to review

1. `git diff` (or `git diff main...HEAD`) to get the changed UI files.
2. Read each changed component/page in full — don't pattern-match on diff
   hunks alone, since a11y bugs are often about what's *missing*.
   When a finding depends on a derived value ("this reduces to zero," "this
   list becomes empty," "this condition can never be true"), trace the
   actual derivation function — don't infer the mechanism from what seems
   plausible. A wrong mechanism can make a real finding's severity or
   trigger conditions inaccurate even when the underlying bug is genuine.
3. Where feasible, actually drive the change: tab through it, check it with
   a browser accessibility tree inspector, and skim console/axe warnings if
   the dev server is running. Static reading catches structural issues but
   not everything (e.g. focus order bugs) — flag in your findings if you
   only did a static review and didn't run the app.
4. Report findings most-severe first. Severity ordering: keyboard trap /
   unreachable control > missing form label / broken focus management >
   missing ARIA reference > contrast/colour-only signal > minor semantic
   nit.
5. **When a fix touches focus restoration or a live region, check whether
   the diff's own test asserts against an independently-known-correct
   target, not against "whatever the same selector logic the implementation
   uses would also find."** A test that greps `document.activeElement`
   against `container.querySelector('button, [tabindex]')` — the exact same
   first-match query the code under test uses — passes as long as focus
   lands on *something* the selector matches, even the wrong something; it
   can never catch a wrong-target bug because it never independently names
   the target (e.g. "the button whose text is literally 'Delete'"). This is
   a real gap in test coverage worth calling out on its own, separate from
   whether the underlying focus behavior itself is correct — a passing
   suite next to this pattern is not evidence the fix works.
6. **A fix confirmed by re-reading the conversation is not the same claim as
   a fix confirmed by re-reading the file.** When re-verifying a finding —
   your own from earlier in this session, or one handed off by another
   review — re-read the current file content directly rather than trusting
   that a fix which was correctly reasoned through in discussion actually
   landed on disk. Mid-conversation, "traced the right fix" and "wrote the
   right fix" are easy to conflate, especially across a task switch or a
   long back-and-forth; grep the file for the specific line/pattern the fix
   was supposed to introduce before reporting it as done.

For each finding give: the file/line, what's wrong, which WCAG 2.1 AA
success criterion it violates, and the concrete fix (not just "improve
accessibility").

Since review here is static reading, most render-mechanics questions are
decidable from the code alone — e.g. whether a live region or inline error
has a mechanism (`nonce`, `key={errorCount}`, a reset before the async
call) to force a remount on a repeat trigger. Report those as real findings
when the mechanism is missing, not as `Needs validation`. Reserve `Needs
validation:` for what genuinely can't be traced from the code — state reset
by a path you can't follow, or AT-timing behavior that varies by screen
reader. Report these separately from the severity-ordered findings: the
file/line, the specific risk, and the exact steps a human needs to take in
a running app to check it (e.g. "click Get stats twice; confirm whether the
sr-only announcement fires the second time").
