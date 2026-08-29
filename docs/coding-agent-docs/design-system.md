# Design System

Read this before any task involving UI, CSS, styling, or visual look and feel.

This project uses **GC Design System (GCDS)** tokens, spacing, typography, and colours wherever possible. Custom values need a valid reason (a Canada.ca Specification design GC DS doesn't cover yet, or a genuine gap).

## CSS file structure

All app styles are loaded once in `src/App.js`:

- `global.css` — site-wide rules (layout, typography, shared components)
- `admin.css` — admin and auth pages
- `chat.css` — chat interface

**Never import these files in individual pages or components**, and don't move the imports to `index.js`: `App.js` must load after `index.js`'s GCDS CSS or the GC DS fonts break.

**Do not create new CSS files.** Add styles to the appropriate existing file. A new file needs a genuinely separate concern and a comment at the top explaining why.

## CSS cleanup

The existing CSS has accumulated scattered, inconsistently named, underreused custom classes. Two rules:

1. **Don't create new problems.** Component classes can bundle many properties (a card, a table row), but genuinely reusable values — a type-scale step, a border style, a spacing value — are defined once as a utility, not duplicated across components. Use descriptive names (`.metric-label`, `.status-badge`), not presentational ones (`.grey-text`, `.bold-14`). Reach for GC DS shortcuts and `var(--gcds-*)` tokens before hardcoded values.

2. **Don't fix old problems unless directly relevant.** No refactoring existing classes as a side effect. A small, safe in-place improvement to a class the current task already uses is fine — no further.

**Stay scoped.** Don't raise CSS issues outside the current PR's files; a CSS review on a page/file is requested explicitly.

## No Tailwind

Tailwind is **not installed**. Tailwind-style class names (`text-red-600`,
`gap-2`, `mb-2`, `rounded`, `p-2`, `items-center`, `w-4`…) pasted in from
copied examples render as dead classes. (GC DS's own `.d-flex`/`.flex-1`
and `global.css`'s `.flex-center` can make a Tailwind `flex` look
intentional — it isn't.) Flag any you see; when
asked to fix, replace with the nearest GC DS token/utility or a real custom
class — never add a Tailwind config.

## No inline styles

No inline `style={{...}}` — add a CSS class. The only exception is a genuinely dynamic, runtime-computed value (a width, a colour).

## Italics

No italics (Canada.ca Content Style Guide rule). Exceptions are narrow: French/foreign words, legal references, math/scientific material, titles of works, Latin terms/abbreviations. UI labels, placeholders, status text, and quoted content don't qualify.

- No `font-style: italic` (CSS or inline `style`).
- No `<em>` for styling — it means stress emphasis, not "make it italic." Use `<strong>` or nothing.
- No `<i>` outside the exceptions above. (Font-icon glyphs like `<i className="fa-solid fa-close">` aren't text italics — not a concern.)

## Icons

Use a **GC DS icon** (`<GcdsIcon name="warning-triangle" />`) first; fall back to **Font Awesome** (`<i className="fa-solid ...">`) only when no GC DS equivalent exists. This is for new UI, not a migration of existing icons.

## Styling hierarchy

When adding any style, follow this order — stop at the first option that works:

1. **GC DS utility class** — covers the need with a single class, no new CSS required
2. **GC DS token** — no utility class fits, but a `var(--gcds-*)` token covers the value
3. **Hardcoded value** — no token exists; leave a short comment so a designer can review it later

**Check for a related element's existing class before writing a new one.** If a sibling already solves the same problem (list-item spacing, a form-embedded `<details>` border), reuse or extend that class — e.g. `.canada-ca-list-spcd-2 li` is shared by BatchUpload and `ExpertFeedbackComponent` lists.

**Write custom CSS as though it could be proposed back to GC DS.** Prefix proposal-candidate classes with `canada-ca-` (Canada.ca Specification team, distinct from GC DS and WET-BOEW naming). If a custom value reveals a real gap in GC DS's tokens, leave a `TOKEN SUGGESTION` comment saying what GC DS could add and why — see `.canada-ca-list-spcd-2` for an example.

### CSS shortcuts vs. custom CSS with tokens

- **CSS shortcuts** for simple changes needing a few styles — a link look, label spacing, a text colour.
- **A custom class with tokens** for elements with many properties that belong together — a chat bubble, a stat card, a form panel. Keep the whole definition in one class; don't split it between a class and scattered utilities.

**Typography is the exception to bundling.** Font-size deviations go in standalone utility classes, referenced by components rather than embedded in them. The existing set is in `global.css`: `.font-size-text-sm-nr` (18px, `--gcds-font-sizes-text-small`), `.font-size-text-xsm-nr` (16px), `.font-size-text-xxs-nr` (14px) — `nr` = non-responsive, so they don't shrink on mobile. Keep the set few, stepping with the GC DS type scale; 14px is the floor.

## GC Design System tokens

**Prefer GC DS tokens over hardcoded values** whenever a token exists. Before hardcoding, check:

- `node_modules/@cdssnc/gcds-utility/dist/gcds-utility.css` — colour palette, border-radius, focus, link, text tokens
- `node_modules/@gcds-core/components/dist/gcds/gcds.css` — component-level tokens

### Common token mappings

| Hardcoded value | GC DS token |
|---|---|
| `#26374A` | `var(--gcds-color-blue-muted)` |
| `#333` / `#333333` | `var(--gcds-text-primary)` |
| `#43474e` | `var(--gcds-text-secondary)` |
| `#284162` (link) | `var(--gcds-link-default)` |
| `#0535d2` (link hover) | `var(--gcds-link-hover)` |
| `#d3080c` (error red) | `var(--gcds-color-red-500)` |
| `#0535d2` (focus — same hex, different semantic token) | `var(--gcds-focus-border)` |
| `border-radius: 2px` | `var(--gcds-border-radius-sm)` |
| `border-radius: 4px` | `var(--gcds-border-radius-md)` |

```css
/* Prefer */
color: var(--gcds-text-primary);
background-color: var(--gcds-color-blue-muted);
border-radius: var(--gcds-border-radius-md);

/* Avoid */
color: #333;
background-color: #26374A;
border-radius: 4px;
```

Hardcoded values are acceptable when no token maps to the property or a third-party component needs a specific value — leave a short comment saying why.

Custom colour shades (chart contrast, extra data-series colours) should be a natural step within the GC DS palette (e.g. one stop darker than an existing token), not an unrelated value.

## Dashboard chart colours

For admin dashboards, import shared colour constants — never hardcode chart hex values:

```js
import { COLOURS } from 'src/constants/dashboardColours.js';   // COLOURS.correct, .hasError, .brand, …
```

Greys and borders used only for structural layout (not data encoding) may stay local.

## Status/outcome message states

`src/components/admin/StatusMessage.js` renders every save/delete/import/export/test-run/upload outcome and general-purpose loading state (usage/announcing: [status-and-error-messaging.md](status-and-error-messaging.md)). It has **five built-in states**, each styled by GC DS-token classes in `admin.css` — reuse one, don't hand-roll a sixth colour/icon combination:

| State | How to render it | Class | Tokens | Icon | Use |
|---|---|---|---|---|---|
| Loading | `<StatusMessage loading message={...} />` | `status-message--loading` | `--gcds-color-grayscale-50/200/700` | `.loading-animation` pulsing-bars spinner (shared with `.section-loading-indicator`, `prefers-reduced-motion`-aware) | In-progress state, not a completed result |
| Error | `<StatusMessage variant="error" message={...} />` | `status-message--error-box` | `--gcds-color-red-100/500/700` | `GcdsIcon warning-triangle` | Failures |
| Warning | `<StatusMessage variant="warning" message={...} />` | `status-message--warning-box` | `--gcds-color-yellow-100/500/750` | `GcdsIcon warning-triangle` | Cautions (e.g. unsaved changes) |
| Info | `<StatusMessage variant="info" message={...} />` | `status-message--info-box` | `--gcds-color-blue-100/500/700` | `GcdsIcon info-circle` | Neutral confirmations |
| Success | `<StatusMessage variant="success" message={...} />` | `status-message--success-box` | `--gcds-color-green-100/500/700` | raw `fa-solid fa-check-circle` span | Completed saves |

- Use `variant` for anything new; `isError`/manual box-modifier `className` are the pre-`variant` convention. Pass `children` only when content is richer than icon + one string (you then supply the icon).
- Boxes default to `width: fit-content; max-width: 65ch` — a standardized default, not a per-site opt-in.
- **Never pass a spacing utility (`mt-*`/`mb-*`) to `StatusMessage`** — the box rule already carries `--gcds-spacing-250` margins.
- Plain `style`/`isError` with no `variant` is only for content that fits none of the five (e.g. a compact inline indicator beside a label).
- The 5-state system was built accessibility-led without a design refinement pass — functional but provisional.
- A full-page loading overlay is a separate component, `src/components/admin/LoadingOverlay.js` — see status-and-error-messaging.md.

## GC DS utility classes

Before writing custom CSS, check whether a GCDS utility class (spacing, typography, colour, flex/grid) already covers it: https://design-system.canada.ca/en/css-shortcuts/

## CSS review

When a designer requests a CSS review on a page or file, audit for the following and report grouped by category — flag, don't silently fix.

1. **Non-token values without a rationale comment** where a GC DS token exists.
2. **Near-duplicate values for the same purpose** (`#333` and `#111` as body text; `#ccc` and `#ddd` as borders).
3. **Redundant padding/margin** across nested levels.
4. **Simplifications with negligible visual change** — inherited properties restated, redundant `display`, over-specific selectors.
5. **Near-identical classes differing by one value** — consolidate into a base class + modifier/custom property.
6. **Markup/layout that could use GC DS grid, tokens, or utilities instead.**
7. **`!important` without a rationale comment.**
8. **Missed reuse** — a new class duplicating a sibling's rule for the same purpose.
9. **Token proposal candidates** — a custom value that fills a generalizable GC DS gap; shape it into a `TOKEN SUGGESTION`.
10. **Tailwind-style classes** (see "No Tailwind") — grep `src/styles/*.css` to confirm whether a class is real.

For each finding, include the class name(s) and the page(s) where they render (e.g. "visible on `/en/admin/dashboard` — exec dashboard cards") so changes can be verified in the browser.

## GCDS React components

Prefer CSS shortcuts on standard HTML over GCDS React components: standard elements can be tracked with analytics, GCDS React components can't yet. Don't introduce new ones.

**Exception: complex patterns on admin/partner-only pages.** Analytics isn't a requirement there, so a component with substantial built-in behaviour that would be error-prone to hand-roll (e.g. `gcds-file-uploader`'s drag-drop, file list, validation, ARIA) may be used directly. Simple elements (links, buttons, headings) still use CSS shortcuts.

## Auto-refreshing content: pause/resume toggle (WCAG 2.2.2)

Any UI that auto-refreshes on a timer (a polling table, a live status view) needs a way to stop it (WCAG 2.2.2 Pause, Stop, Hide). Don't hand-roll `setInterval` + pause state — use the shared hook and button:

- `src/hooks/usePauseToggle.js` — `usePausablePolling(fn, intervalMs, deps)` owns the interval lifecycle for "fetch on mount, keep refreshing". For a poll that starts/stops conditionally, use `usePauseToggle()` + `guardPoll(fn)` (see `ExperimentalAnalysisPage.js`).
- `src/components/admin/PauseToggleButton.js` — the pause/resume button, wired to `isPaused`/`togglePause`.

```jsx
const { isPaused, togglePause } = usePausablePolling(fetchThing, 10000, [fetchThing]);
// ...
<PauseToggleButton isPaused={isPaused} onToggle={togglePause} t={t} />
```

References: `BatchList.js`, `SessionPage.js`, `ExperimentalAnalysisPage.js`. Content that refreshes only as a side effect of a user action doesn't need this.

`PauseToggleButton` is a native `<button>`, not `<GcdsButton>` (an `aria-pressed` timing bug through the shadow DOM — see its file comment; visual treatment carries a `TODO(design)`). Use the same native-button + `.filter-button-primary`/`.filter-button-outline` pattern for any other `aria-pressed` toggle.
