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
- **Targeted review** — the user names a specific page/component/route;
  scope to that.
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
- Focus is visible — never `outline: none` without a replacement that meets
  contrast requirements (GC DS focus tokens, e.g. `var(--gcds-focus-border)`,
  already provide this — flag any custom override that suppresses it).

### 4. ARIA usage
- ARIA attributes are used to *supplement*, not replace, semantics — flag
  any case using ARIA to fix something a native element would solve for free.
- Every `aria-*` reference (`aria-labelledby`, `aria-describedby`,
  `aria-controls`) points to an ID that actually exists in the rendered DOM.
- Live regions (`aria-live`, `role="alert"/"status"`) are used for dynamic
  content that needs to be announced (errors, async results, loading state)
  — and not overused to the point of announcement spam.
- A live region announces a *change*, not a value. If a message is set
  directly from state that's never reset between triggers, a repeated
  action with the same outcome could render identical text — React makes no
  DOM mutation, and AT gets nothing after the first time. Static reading
  can't confirm this either way — report it as `Needs validation:` (see
  "How to review" below), not as a pass or a fail.
- No redundant/conflicting roles (e.g. `role="button"` on an actual
  `<button>`).

### 5. Forms
- Every input has a programmatically associated label (`<label for>`,
  `aria-label`, or `aria-labelledby`) — not just placeholder text.
- Required fields are marked both visually and programmatically
  (`required`/`aria-required`).
- Error messages are associated with their field (`aria-describedby`) and
  announced (see Focus management above), not conveyed by colour alone.
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

### 8. Bilingual/i18n interaction with accessibility
- `lang` attribute correctness isn't broken by the change (page-level `lang`
  should match the active locale).
- New a11y-relevant strings (aria-labels, alt text, error announcements) go
  through `t()` with entries in **both** `en.json` and `fr.json` — same rule
  as all user-facing text in this repo, but easy to miss for attributes that
  aren't visibly rendered text.

## How to review

1. `git diff` (or `git diff main...HEAD`) to get the changed UI files.
2. Read each changed component/page in full — don't pattern-match on diff
   hunks alone, since a11y bugs are often about what's *missing*.
3. Where feasible, actually drive the change: tab through it, check it with
   a browser accessibility tree inspector, and skim console/axe warnings if
   the dev server is running. Static reading catches structural issues but
   not everything (e.g. focus order bugs) — flag in your findings if you
   only did a static review and didn't run the app.
4. Report findings most-severe first. Severity ordering: keyboard trap /
   unreachable control > missing form label / broken focus management >
   missing ARIA reference > contrast/colour-only signal > minor semantic
   nit.

For each finding give: the file/line, what's wrong, which WCAG 2.1 AA
success criterion it violates, and the concrete fix (not just "improve
accessibility").

Since review here is static reading, not a driven browser session, some
risks can be spotted in code but not confirmed from code alone — most
commonly, whether a live region's content actually changes on a repeat
trigger (see ARIA usage above). Don't report these as a normal severity
finding. Report them as a separate `Needs validation:` item instead: the
file/line, the specific risk, and the exact steps a human needs to take in
a running app to check it (e.g. "click Get stats twice; confirm whether the
sr-only announcement fires the second time"). List these after the
severity-ordered findings, not mixed into them.
