---
name: accessibility-review
description: Review the pending diff (or a named page/component) for WCAG 2.1 AA accessibility issues — semantic HTML, ARIA, keyboard navigation, focus management, colour contrast, forms, and screen-reader behaviour. Use before merging any UI-touching change, or when the user asks for an accessibility/a11y review.
---

# Accessibility review

GC public-facing service: the bar is **WCAG 2.1 AA** in EN and FR, not "best practice."

## Scope — four modes

Infer from the request; ask if "everything" is ambiguous (diff vs. whole app).

- **Diff review (default)** — `git diff` vs. base branch, UI code only (`src/pages/`, `src/components/`, `src/hooks/`, CSS). Non-UI-only diff → say so and skip. Issues in code the diff *adds/changes* are blocking. Issues in code it merely *touches* (pre-existing defect) → `// TODO(a11y):` note with the SC, not a blocker, unless the fix is trivial. Label which is which.
- **Targeted review** — user names a page/component/route. Read it in full, then recursively follow its imports into every shared component/hook/util it renders or calls (`FilterPanel.js`, `StatusMessage.js`, DataTables helpers…) and apply the full checklist there too. A bug in a shared file → grep its other consumers and list them (they inherit it).
- **Full app audit** — "audit everything", "whole app", explicit `full`, or a named-area shortcut. Covers every in-scope route, not just changes.
- **Audit re-verification / update** — "update the audit", "is this still accurate", "re-check against main". Must re-examine application code, not just the audit doc's bookkeeping.

### Full app audit

Large — confirm scope first if unclear (public only, or admin/partner too?).

**Named-area shortcuts** (check against `roles`/`RoleProtectedRoute` in `src/App.js`):

- **"public chat"** — `HomePage.js` + `src/components/chat/*`. Already has a completed, passed audit; confirm the user really wants a re-audit.
- **"auth" / "staff account"** — Login/Register/Logout/ResetRequest/ResetVerify/ResetComplete/About/HowTo/404. No `roles`, but **not public-user pages**: there is no public account system; the public only uses the chat anonymously. These are the pages hit *before* staff auth.
- **"admin"** — **everything behind auth**: every `src/App.js` route with a `roles` array (dashboards, chat/session/batch tooling, eval tooling, utility pages, experimental, partner-shared pages). Not just `AdminPage.js`.
- **"partner"** — the subset whose `roles` includes `'partner'` (ChatDashboardPage, AdminPage shell, BatchPage, ChatViewer, EvalDashboardPage, PublicEvalPage, Metrics/PublicDashboard/PartnerDashboard/TechnicalMetrics, ScenarioOverridesPage). Partner is a role, not a page set; `['admin']`-only pages (Users/Settings/Database/Vector/Connectivity/Sessions/AutoEvalDashboard/EvalPage) are excluded.
- **"experimental"** — `src/pages/experimental/*` + `src/components/experimental/*`.

Otherwise:

1. Enumerate: `ROUTE_SLUGS` in `src/utils/routes.js` → page component in `src/pages/`. Include admin/partner routes unless told otherwise.
2. Group pages by shared components; review each shared component once and list every page it affects.
3. Won't fit one context: delegate groups of ~3–6 pages to parallel background `Explore`/`general-purpose` agents, each given Sections 1–8 and the finding format below. Audit-only, no fixes.
4. Aggregate, dedupe shared-component repeats, sort most-severe-first.
5. Offer (don't assume) an Artifact report grouped by page/component with severity, SC, fix.
6. **Propagate confirmed anti-patterns.** Once a finding is verified, grep the whole in-scope surface (ideally the repo; note out-of-scope hits) for the same code shape before moving on. History: redundant `tabIndex="0"` on `<GcdsDetails>` (dead extra tab stop) was caught in one page and missed in two identical ones because files were reviewed independently.

### Audit re-verification

Two **separate** requests — don't bundle; ask if ambiguous ("update the audit" alone = A). The failure mode guarded against is trusting old conclusions instead of rereading code:

- A past "updated" pass re-verified logged findings against PR diffs but never re-scanned already-audited files for new code — a feature added one day after the first pass sat unflagged through the second.
- A long-standing autosave-per-keystroke went unflagged for months because no checklist version asked the SC 3.2.2 question — a category blind spot, catchable only by B.

**Request A — revalidate the work in progress.** Cheap. For every logged finding (open or fixed) and tracked file/pattern, re-verify against current `main`: still accurate, still open, actually fixed, or moved? Cannot surface anything the original audit never saw. Triggers: "update the audit", "is this still accurate", "re-check the findings against main".

**Request B — recheck against changes since the audit started.** Cost ≈ fresh full audit; confirm first. Re-run Sections 1–8 over the audit's full declared scope, targeting drift (new code in covered files) and category blind spots (not diff-scopable). Triggers: "recheck against changes since it started", "full drift check", "re-audit for anything new".

Rules:

1. **(B only)** Per covered file (findings *and* clean), `git log --oneline <since-last-audit>.. -- <file>`; if anything landed, re-read the whole file against the whole checklist. "Already audited" never excuses new code.
2. **Don't assume new-looking code is new.** Check when it landed (`git log -1 --format=%ad -- <file>`, `git log -S"<anchor>" -- <file>`) against pass dates. Landed between passes → a miss, not out-of-window.
3. **"PR merged" ≠ fixed.** Re-read the actual lines; PRs get trimmed/rebased/split.
4. Apply "propagate confirmed anti-patterns" — B is when a pattern fixed in one file is most likely still lurking in a sibling.
5. Record per finding what was re-checked vs. carried forward unverified. State at the end whether this was A or B.

## What to check

File by file; skip categories that plainly don't apply.

### 1. Semantic HTML & structure
- Native elements over ARIA-patched `<div>`s; list markup for lists; landmarks present, not duplicated.
- Sequential headings; exactly one `<h1>`.
- Skip link (SC 2.4.1) early in DOM order — check what precedes it, not just that it exists (easy to miss inside shadow DOM, e.g. `GcdsHeader`'s `skipToHref`).
- **Element chosen for its default styling, not its meaning, is wrong even before a symptom shows.** Tell: the tag's implied relationship doesn't exist — `<label>` with no `for`/wrapped control (a button group has none), handler-less `<button>` for the reset look, `href`-less `<a>` for the cursor. Surfaces later as confusing bugs (a `<label>` captioning a preset-button group produced WebKit's AXGroup/"empty" reading once it became a focus target — misread as a focus bug). Before a tag swap (`<label>` → `<p>`/`<span>`), confirm the CSS selector is `.foo` not `label.foo`. Then propagate-grep.

### 2. Keyboard
- Everything clickable is keyboard-operable (Tab/Shift+Tab, Enter/Space, Esc for dismissible UI, arrows for radio/tab/listbox groups).
- Tab order = reading order; no `tabindex` > 0.
- No traps; modals/dropdowns release focus on close.
- Custom widgets follow the ARIA APG keyboard model, not just click handlers.

### 3. Focus management
Follow the established pattern (`fix: error message focus management`, `fix: feedback form error focus` commits); don't reinvent.
- Validation error → focus to error summary/first invalid field.
- Dynamic change (route, modal, async swap) → focus lands somewhere sensible, never silently on `<body>`.
- **`<a href>`/`GcdsLink` ≠ `navigate()`.** Real links get browser focus reset + title announcement for free; `navigate()` is `pushState` and gets neither. Grep `useNavigate`/`navigate(` — every call site needs its own or a centrally-wired focus story. Key effects on `location.key`, not `pathname`: a query-string-only transition (`?chat=...`) never fires a pathname-keyed effect.
- **Each page needs its own `document.title` (SC 2.4.2).** A shared generic title (or only some pages setting one) is a real finding — identical tabs/bookmarks are the sighted symptom. Reuse the page's `<h1>` locale key, don't add a duplicate string.
- For every dismiss/clear/toggle/remove control — **including effects that auto-close/collapse/unmount on a prop/state change (no click to trace from)** — check whether the state it changes feeds the control's *own* render condition (`{x && <Control/>}`, ternary, `display:none`). If so, that handler/effect must redirect focus explicitly. Check each control independently: "Clear all", a pill's own remove, a search-clear pill can each have this bug in the same component.
- Focus visible: no `outline: none` without a contrast-passing replacement (GC DS `var(--gcds-focus-border)` already does; flag overrides).
- **Focus-restore that survives re-render doesn't survive removal.** Pattern: click → arm ref with item id → redraw consumes it and refocuses. Works for edit/reorder/status change; structurally fails when success *removes* the item (delete, dismiss-that-deletes) — nothing redraws that id. Find the success path, confirm the item is gone from the next render, and require a separate explicit target (e.g. an always-mounted nearby control). Real case: a delete's `finally` re-fetch was checked for Process/Cancel but never for delete's own success path.
- **Restore by "first interactive element" can pick the wrong one.** `querySelector('button, [tabindex]')` fallbacks misfocus whenever the clicked item isn't reliably first (row actions vary by status: Cancel-then-Delete vs Delete-alone → failed Delete lands on Cancel). Not an SC 2.4.3 failure, but a reportable imprecision. Tell: mechanism tracks *that* something was clicked, not *which*.
- **Cross-root focus race.** A `.focus()` from an async handler in one React root can run before a separate `createRoot`/`root.render()` (e.g. DataTables cell renders) commits, and that root's self-focusing element (a "Processing…" placeholder with focus-on-mount) steals it back. Looks correct in code, fails live. Microtasks don't fix it; needs a macrotask (`setTimeout`) after the other root's commit. Flag sync/microtask redirects that compete with a separately-rooted self-focuser as `Needs validation:` minimum, real finding if the trace confirms the ordering isn't guaranteed.

### 4. ARIA
- ARIA supplements semantics; flag ARIA used where a native element solves it.
- Every `aria-labelledby`/`aria-describedby`/`aria-controls` points at an ID that exists in the rendered DOM.
- Live regions for errors/async results/loading, not spammed.
- **Live regions announce a change, not a value.** State-driven message with no remount-forcing mechanism → React no-ops the identical second update and it goes silent. Decidable from code: real finding (SC 4.1.3). `StatusMessage` `persistent` has a `nonce` prop for this; check it's used wherever an outcome can repeat.
- **Check *how* re-announcement is forced.** Putting the changing value in the element's `key` creates a fresh node with text already inside — the exact "populated on insertion" failure `persistent` exists to prevent. Real finding. Fix is an in-place mutation on the same node; a test asserting node identity is unchanged across the trigger verifies it.
- **Duplicated live regions (one `StatusMessage` per list/panel/tab) must have per-instance nonces.** A shared counter remounts B when only A changed, re-announcing B's stale message. Find every nonce update and confirm each `<StatusMessage nonce={...}>` reads a value that changes only with its own message. Real finding (SC 4.1.3).
- No redundant/conflicting roles (`role="button"` on `<button>`).

### 5. Forms
- Every input has a programmatic label (not placeholder-only).
- Required marked visually and programmatically.
- Errors associated via `aria-describedby`, announced, not colour-only.
- **Repeat identical failures still announce.** Plain `useState` error with no counter goes silent the second time. `FeedbackInlineError` needs a changing `errorCount` (`useInlineFormError.js`; AGENTS.md "FeedbackInlineError needs errorCount").
- Radio/checkbox groups have `<fieldset>`/`<legend>` or `role="group"` + label.
- **Persisted changes need an explicit trigger (SC 3.2.2).** Save-per-keystroke / save-on-blur with no undo and no advance notice = On Input failure. **Separate from SC 4.1.3** — a perfectly announced autosave is still a 3.2.2 problem; flag both. Prefer stage-locally + real Save with dirty tracking for anything consequential (settings, redaction rules).

### 6. Colour & contrast
- 4.5:1 text / 3:1 large text & UI components; check new colours against GC DS tokens (`docs/coding-agent-docs/design-system.md`), don't eyeball.
- Colour never the only state signal.
- **Verify the class exists before computing contrast.** No Tailwind here, but Tailwind-style names (`text-red-600`, `bg-red-50`, `gap-2`, `p-2`…) get pasted in — grep `src/styles/*.css`. Undefined class = unstyled, a different and often worse bug (missing padding/background/icon size). Report "undefined class" and point at the real pattern, not a ratio for a rule never applied.

### 7. Images & non-text
- Meaningful images: real `alt`; decorative: `alt=""` (not omitted).
- Icon-only controls have an accessible name — in both languages.
- **CSS `content` glyphs (`::before { content: '►' }`) are read by AT** (Chrome+NVDA/JAWS, Safari+VoiceOver), unlike background images — noise on every instance if the pattern is shared (e.g. every `<details>/<summary>`). Grep CSS for `content: '<char>'` on interactive pseudo-elements; fix is a CSS mask (`mask-image` + `background-color: currentColor`) or an `aria-hidden` image.

### 8. Bilingual / i18n
- Page-level `lang` matches the active locale and isn't broken by the change.
- New a11y strings (aria-labels, alt, announcements) go through `t()` with entries in **both** `en.json` and `fr.json` — easy to miss for non-visible attributes.
- **Raw runtime text interpolated into a translated message needs its own `lang="en"` wrapper.** Exception messages, HTTP status/text, backend error detail are always English; a French screen reader mispronounces them. Look for `${error}`, `.replace('{error}', …)`, `{error.message}`, `status` with no `<code lang="en">`/`<span lang="en">` around just that part — `t()` around the sentence isn't enough. Systemic: one pass found it independently in ~10 files; propagate-grep once confirmed.

## How to review

1. `git diff main...HEAD` for changed UI files.
2. Read each changed file in full — a11y bugs are about what's *missing*. When a finding rests on a derived value ("reduces to zero", "list becomes empty", "never true"), trace the actual derivation; a wrong mechanism skews severity/trigger even when the bug is real.
3. Where feasible, drive it: tab through, check the accessibility tree, skim axe/console if the dev server is up. Say if you only did a static review.
4. Most-severe first: keyboard trap / unreachable control > missing label / broken focus management > missing ARIA reference > contrast / colour-only > semantic nit.
5. **Focus/live-region fixes: does the diff's test name an independently-correct target?** A test asserting `activeElement` matches the same `querySelector('button, [tabindex]')` the implementation uses passes on the *wrong* target too. Call out as a coverage gap, separate from whether the behaviour is correct.
6. **Confirmed-in-conversation ≠ confirmed-on-disk.** When re-verifying any finding (yours or handed off), grep the current file for the specific line the fix should have introduced before reporting it done.

Per finding: file/line, what's wrong, WCAG 2.1 AA SC, concrete fix.

**Keep the report terse.** One finding = one short paragraph or bullet: no restating the rule, no narrating what you read, no preamble/recap of clean areas beyond a one-line "checked X, Y, Z — no issues." Explanation belongs in the finding's fix, not in a summary section.

Render-mechanics questions (nonce, `key={errorCount}`, reset-before-async) are decidable from code — report missing mechanisms as real findings. Reserve `Needs validation:` for what genuinely can't be traced (state reset in an unfollowable path, AT-timing that varies by screen reader); list those separately with file/line, the risk, and exact manual steps (e.g. "click Get stats twice; confirm the sr-only announcement fires the second time").
