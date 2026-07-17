---
name: accessibility-review
description: Review the pending diff (or a named page/component) for WCAG 2.1 AA accessibility issues — semantic HTML, ARIA, keyboard navigation, focus management, colour contrast, forms, and screen-reader behaviour. Use before merging any UI-touching change, or when the user asks for an accessibility/a11y review.
---

# Accessibility review

This app is a Government of Canada public-facing service. It must meet
**WCAG 2.1 AA** (the GC baseline) in both English and French. Treat that as
the bar for every finding, not "best practice."

## Scope

There are three modes. Infer which one from the request; ask if it's
ambiguous whether "everything" means the diff or the whole app.

- **Diff review (default)** — `git diff` against the base branch, UI code
  only (`src/pages/`, `src/components/`, `src/hooks/`, CSS). If the diff
  touches only non-UI code (API, services, agents, prompts), say so and skip
  the review rather than forcing findings.
- **Targeted review** — the user names a specific page/component/route;
  scope to that.
- **Full app audit** — triggered by phrasing like "audit everything",
  "whole app", "full accessibility audit", or an explicit `full` arg. Covers
  every route, not just what changed. See below.

### Full app audit

This is a large task — confirm scope with the user before starting if it's
not obvious (e.g. "just public-facing pages, or admin/partner tools too?").

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

### 6. Colour & contrast
- Text and meaningful icons meet 4.5:1 (normal text) / 3:1 (large text, UI
  components) against their background — check any new custom colour against
  GC DS tokens (`docs/coding-agent-docs/design-system.md`) rather than
  eyeballing it.
- Colour is never the *only* signal for state (error, success, required) —
  there's always a text/icon/shape cue alongside it.

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
