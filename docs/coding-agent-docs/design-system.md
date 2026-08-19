# Design System

Read this before any task involving UI, CSS, styling, or visual look and feel.

This project is styled with the **GC Design System (GCDS)** tokens, spacing, typography, and colours wherever possible. Deviations with custom values should have valid use cases, such as supporting a design not yet implemented from the Canada.ca Specifications, or addressing gaps required for the project.

## CSS file structure

All app styles are loaded once in `src/App.js`:

- `global.css` — site-wide rules (layout, typography, shared components)
- `admin.css` — admin and auth pages
- `chat.css` — chat interface

**Never import these files in individual pages or components** — they are already globally available. Do not move these imports to `index.js` either: `App.js` must load after `index.js`'s GCDS CSS (`gcds-utility.min.css` imports Lato/Noto Sans from Google Fonts) so that webpack resolves stylesheets in the correct order. Moving app CSS into `index.js` alongside GCDS CSS breaks the GC Design System fonts.

**Do not create new CSS files.** Add new styles to the appropriate existing file above. A new file is only justified if it introduces a genuinely separate styling concern that cannot reasonably live in one of the three — document the reason in a comment at the top of the file if you do.

## CSS cleanup

The existing CSS files have accumulated custom classes that are scattered, inconsistently named, and underreused. Two rules govern how to handle this:

1. **Don't create new problems.** Component classes can be comprehensive — a dashboard card or table row legitimately needs multiple properties together. The goal is not "one property per class" but to identify what's genuinely reusable and treat it like a utility. Common properties like a typography scale step, a border style, or a spacing value should be defined once and reused, not duplicated across component classes. Use descriptive, context-appropriate names (e.g. `.metric-label`, `.status-badge`) rather than presentational ones tied to a specific value (e.g. `.grey-text`, `.bold-14`). When writing any custom class, refer back to GC DS CSS shortcuts and tokens first — use a utility class or `var(--gcds-*)` token for as many property values as possible before reaching for a hardcoded value.

2. **Don't fix old problems unless directly relevant.** Don't refactor existing classes as a side effect of unrelated work. The exception: if you spot a custom class that could serve the current task with a small, safe change (e.g. making it slightly more specific or utility-like), it's reasonable to improve it in place — but don't go further.

**Stay scoped to the relevant file.** If the task touches the dashboard, only look at dashboard-related styles. Do not raise CSS issues in files outside the current PR's scope. If a user wants a CSS review on a specific page or file, they can request one explicitly.

## No Tailwind

This project has **no Tailwind dependency** — it is not installed and no
Tailwind config exists. Never write Tailwind-style utility class names
(`text-red-600`, `bg-red-50`, `gap-2`, `mb-2`, `rounded`, `p-2`, `flex`,
`items-center`, `w-4`, `h-4`, etc.) expecting them to work; a handful of
these have been pasted into JSX over time from copied examples and render as
dead classes — no padding, no background, no colour, default browser
styling — not what the author intended. `.flex` happens to exist as a real
utility class in `global.css`, which makes the surrounding dead classes on
the same element easy to miss.

If you spot Tailwind-style classes while touching a file for any reason,
flag them and, if asked to fix or clean up, eliminate them — replace with
the nearest existing GC DS token/utility or a real custom class per the
hierarchy below, not by adding the missing Tailwind config.

## No inline styles

Do not use inline `style={{...}}` attributes on elements. Add a CSS class instead.

Inline styles are only acceptable when the value is genuinely dynamic and cannot be expressed as a class (e.g. a runtime-computed width or colour).

## Italics

No italics (Canada.ca Content Style Guide rule). Exceptions are narrow: French/foreign words, legal references, math/scientific material, titles of works, Latin terms/abbreviations. UI labels, placeholders, status text, and quoted content don't qualify.

- No `font-style: italic` (CSS or inline `style`).
- No `<em>` for styling — it means stress emphasis, not "make it italic." Use `<strong>` or nothing.
- No `<i>` outside the exceptions above. (Font-icon glyphs like `<i className="fa-solid fa-close">` aren't text italics — not a concern.)

## Icons

When an icon is warranted, reach for a **GC DS icon** (`GcdsIcon`, e.g. `<GcdsIcon name="warning-triangle" />`) first. Fall back to **Font Awesome** (`FontAwesomeIcon`, `<i className="fa-solid ...">`) only when no equivalent GC DS icon exists and an icon genuinely adds value over plain text. Both are already in use across the codebase — this is about which to reach for on new UI, not a migration of existing icons.

## Styling hierarchy

When adding any style, follow this order — stop at the first option that works:

1. **GC DS utility class** — covers the need with a single class, no new CSS required
2. **GC DS token** — no utility class fits, but a `var(--gcds-*)` token covers the value
3. **Hardcoded value** — no token exists; leave a short comment so a designer can review it later

**Check for a related element's existing class before writing a new one.** Custom CSS should be lean, purpose-driven, and consistent across like elements — if a sibling or related element already solves the same problem (e.g. list-item spacing, a form-embedded `<details>` border), reuse or extend that class instead of writing a near-duplicate. Example: `.canada-ca-list-spcd-2 li` spacing is shared by BatchUpload's CSV-instructions list and `ExpertFeedbackComponent`'s harmful-details list, rather than each defining its own rule.

**Write custom CSS as though it could be proposed back to GC DS.** Think through what a real token contribution would look like, not just what solves the immediate problem in front of you. Name proposal-candidate classes with a `canada-ca-` prefix — marking them as coming from the Canada.ca Specification team, distinct from GC DS's own classes or older Canada.ca/WET-BOEW naming. If a custom value reveals a genuine gap in GC DS's token set, leave a `TOKEN SUGGESTION` comment describing what GC DS could add and why — e.g. `.canada-ca-list-spcd-2` uses `1.25em` instead of a fixed `--gcds-spacing-*` token because GC DS's spacing scale is rem-based and can't scale with font size the way list-item spacing needs to; the comment proposes `--gcds-spacing-text-1-25x: 1.25em` as a font-relative step GC DS could add alongside its fixed scale.

### CSS shortcuts vs. custom CSS with tokens

The choice between applying utility classes directly in markup vs. writing a custom CSS class depends on complexity:

- **Use CSS shortcuts** for simple, focused changes that need only a few styles — e.g. styling an `<a>` tag to look like a GC DS link, adding spacing to a label, setting a text colour. A handful of utility classes in the HTML is clean and sufficient.
- **Use a custom CSS class with tokens** for design elements with many properties that need to be understood and maintained together — e.g. a chat message bubble, a dashboard stat card, a form panel. These belong in the CSS file as a named class so the full visual definition is in one place and can be reviewed as a whole. Don't split a complex component's styles between a custom class and scattered utility classes — keep it consolidated.

**Typography is an exception to component bundling.** Font size adjustments (e.g. a small non-responsive label size for mobile context) should be defined as standalone utility classes in the CSS file, not embedded inside component classes. This keeps typographic deviations minimal, named, and reusable — a card or badge can reference `.text-label-small` or `.text-label-small-nr` (nr = non-responsive) rather than each defining their own font size, making it easier to maintain consistency and review the full type scale in one place. Custom sizes must be minimal and strategic — solving a specific problem, not accumulating ad hoc. They should form a coherent sub-scale that respects the GC DS sizing rhythm — stepping in consistent increments that align with the design system's existing type scale (e.g. 14, 16, 18px) rather than a scatter of arbitrary values. The smallest size in the set should have a non-responsive variant so it doesn't become unreadably small on mobile.

## GC Design System tokens

**Prefer GC DS tokens over hardcoded values** whenever a token exists for the property. This keeps the UI consistent with the design system and picks up theme changes automatically.

Before writing a hardcoded value, check the token definitions in:

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

Hardcoded values are acceptable when no GC DS token maps to the property, or when overriding a third-party component that requires a specific value. In those cases leave a short comment explaining why a token wasn't used so a designer can review it later.

The same rhythm principle applies to colours. If additional shades are needed beyond what GC DS provides — for example, to achieve proper contrast ratios for charts or to fill out a data set with enough distinct colours — follow the GC DS colour scale's existing tone and stepping pattern rather than introducing unrelated values. A custom shade should feel like a natural step within the palette (e.g. one stop darker than an existing token) and serve a specific, justified purpose such as a hover state or accessible contrast pair.

## Dashboard chart colours

For admin dashboards, import shared colour constants — never hardcode chart hex values:

```js
import { COLOURS, QUALITY_COLOURS } from 'src/constants/dashboardColours.js';
```

Greys and borders used only for structural layout (not data encoding) may stay local.

## Status/outcome message states

`src/components/admin/StatusMessage.js` is the single component every save/delete/import/export/test-run/upload outcome or autosave failure should render through (see AGENTS.md's "Announcing status, errors, and async outcomes" for the usage-level API — `message`/`isError`/`variant`/`persistent`/`id`). It now has **four built-in states**, each pulling its box styling from GC DS-token classes in `admin.css` — reuse one of these, don't hand-roll a new colour/icon combination for a fifth:

| State | How to render it | Class | Tokens | Icon | Use |
|---|---|---|---|---|---|
| Error | `<StatusMessage variant="error" message={...} />` | `status-message--error-box` | `--gcds-color-red-100/500/700` | `GcdsIcon warning-triangle` | Failures |
| Warning | `<StatusMessage variant="warning" message={...} />` | `status-message--warning-box` | `--gcds-color-yellow-100/500/700` | `GcdsIcon warning-triangle` | Cautions (e.g. unsaved changes) |
| Info | `<StatusMessage variant="info" message={...} />` | `status-message--info-box` | `--gcds-color-blue-100/500/700` | `GcdsIcon info-circle` | Neutral confirmations |
| Success | `<StatusMessage variant="success" message={...} />` | `status-message--success-box` | `--gcds-color-green-100/500/700` | raw `fa-solid fa-check-circle` span (GC DS's icon font has no checkmark glyph, matching the existing precedent in `BatchUpload.js`) | Completed saves |

`variant` builds the icon + text content itself from a plain `message` string — pass `children` instead only when the content is genuinely richer than "icon + one string" (e.g. a follow-up bullet list), in which case you're responsible for your own icon. `isError`/a manual box-modifier `className` still work but are the pre-`variant` calling convention — only still needed for call sites that haven't migrated; use `variant` for anything new. Every box state defaults to `width: fit-content` capped at `max-width: 65ch` — content in this app is line-length-restricted (~65 char), so a box never needs to stretch to fill a wide container, and this is a standardized default rather than something a caller opts into per site. `persistent` keeps the live region mounted while empty so a call site's *first* message is announced as a change rather than missed as an insertion — worth reaching for on anything where the first-ever outcome matters (e.g. a page's initial load error).

Every call site that fits one of the four states above should use it — plain `style`/`isError` with no `variant` is only for content that doesn't fit any of them (e.g. a compact inline indicator next to a label, not a page-level outcome). The whole 4-state system (colours, icon choices, spacing) was built engineering-led, not through a design pass — functional but provisional, per `StatusMessage.js`'s own comments and AGENTS.md.

An in-progress ("still working") indicator is a separate component, not a `StatusMessage` state — see `src/components/admin/Loading.js`'s `LoadingStatus` (inline, `status-message--loading` class, `.loading-animation` pulsing-bars spinner, `prefers-reduced-motion`-aware) and `LoadingOverlay` (full-page/section backdrop). It used to be a `StatusMessage` `loading` sub-type; see AGENTS.md's "Announcing status, errors, and async outcomes" for why it moved out.

## GC DS utility classes

Before writing any custom CSS, check whether a GCDS utility class already covers the need. The utility classes handle spacing, typography, colour, flex/grid layout, and more. Using them avoids new CSS and keeps the UI consistent.

Reference: https://design-system.canada.ca/en/css-shortcuts/

## CSS review

When a designer requests a CSS review on a specific page or file, audit the relevant CSS and markup for the following. Report findings grouped by category — don't silently fix things, flag them for the designer to approve first.

1. **Non-token values without rationale.** Any hardcoded colour, border-radius, or spacing value that has a GC DS token equivalent and no explanatory comment. Every deviation needs a stated reason.

2. **Near-duplicate values that could consolidate.** Look for similar but not identical values used for the same purpose — e.g. `#333` and `#111` used as body text colours, or `#ccc` and `#ddd` both used as borders. Flag candidates for collapsing into a single token or variable.

3. **Redundant padding and margin.** Nested elements where padding or margin cancels out or is applied at multiple levels unnecessarily. Note where the structure could be flattened or a single value would do.

4. **Optimizations with minor visual impact.** Places where simplifying the CSS would have negligible visual change — e.g. removing a property that's already inherited, a redundant `display` declaration, or an overly specific selector.

5. **Shared structure with a differing variable.** Component classes that are near-identical except for one value (e.g. two card classes identical except one has blue text and one has green). Flag these for consolidation: combine into a shared base class and extract the differing value as a modifier class or custom property, reducing duplication and file size.

6. **HTML/CSS that could better use GC DS.** Markup or custom layout code that could be replaced by the GC DS grid system, spacing tokens, or utility classes — reducing custom CSS and aligning more closely with the design system.

7. **`!important` declarations without a rationale comment.** Flag any `!important` that lacks an explanatory comment. `!important` is sometimes necessary to override third-party styles, but must be documented so future maintainers know why it's there and can remove it safely if the override is no longer needed.

8. **Missed reuse across related elements.** A new custom class duplicates a rule a sibling or related element already defines for the same purpose (e.g. list-item spacing, a form-embedded `<details>` border). Flag for consolidation into one shared class.

9. **Opportunities to frame as a token proposal.** A custom value solves a real, generalizable gap in GC DS's token set — not a one-off visual tweak. Spot these and propose shaping them into a `TOKEN SUGGESTION`: name it, scope it, and describe what GC DS could add and why, surfacing the gap as a contribution candidate rather than leaving it as an isolated workaround.

10. **Tailwind-style classes.** Any class name matching Tailwind's convention (`text-red-600`, `bg-red-50`, `gap-2`, `rounded`, `p-2`, `flex`, `items-center`, `w-4`, `h-4`, etc.) — grep `src/styles/*.css` to confirm whether it's real. This project has no Tailwind dependency (see "No Tailwind" above), so most of these are dead classes silently rendering unstyled. Always flag; eliminate when asked to fix, replacing with the nearest real token/class rather than defining the missing rule under a Tailwind-shaped name.

For each finding, include:
- The class name(s) affected
- The page(s) where those classes are visually rendered, so changes can be verified in the browser after implementation (e.g. "visible on `/en/admin/dashboard` — exec dashboard cards")

## GCDS React components

Prefer building UI elements with CSS shortcuts over GCDS React components. CSS shortcuts produce standard HTML elements that can be tracked with analytics; GCDS React components cannot yet. Avoid introducing new GCDS React components — existing usage can be backtracked as necessary.

**Exception for complex patterns behind admin auth.** On admin/partner-only pages (not public-facing), since these are internal tools where tracking through analytics isn't a requirement, and ensuring the ability to refine UX behaviour for complex chat interactions isn't a factor. For a component with significant built-in behaviour that would be substantial and error-prone to hand-roll correctly (e.g. `gcds-file-uploader`'s drag-drop, file list/remove UI, validation states, and ARIA wiring), it's reasonable to adopt the GCDS React component directly rather than reimplementing it with CSS shortcuts or GC DS tokens, over a raw HTML element. Still avoid it for simple elements (links, buttons, headings) where a CSS shortcut is just as easy and keeps analytics tracking intact.

## Auto-refreshing content: pause/resume toggle (WCAG 2.2.2)

Any admin/partner UI that auto-refreshes unconditionally on a timer (a polling table, a live status view) is "moving, blinking, scrolling, or auto-updating" content under WCAG 2.2.2 (Pause, Stop, Hide), and needs a way for the user to stop it. Don't hand-roll a new `setInterval`/pause `useState` for this — use the shared hook and button:

- `src/hooks/usePauseToggle.js` — `usePausablePolling(fn, intervalMs, deps)` owns the whole interval lifecycle (calls `fn` on mount/dep-change and every `intervalMs`, skips ticks while paused, cleans up on unmount) for the common "fetch on mount, then keep refreshing" case. Use `usePauseToggle()` + its returned `guardPoll(fn)` directly instead if the poll starts/stops conditionally rather than on a fixed mount lifecycle (see `ExperimentalAnalysisPage.js`'s batch/comparison polling for that shape).
- `src/components/admin/PauseToggleButton.js` — the pause/resume button rendered next to the auto-updating content, wired to the hook's `isPaused`/`togglePause`.

```jsx
const { isPaused, togglePause } = usePausablePolling(fetchThing, 10000, [fetchThing]);
// ...
<PauseToggleButton isPaused={isPaused} onToggle={togglePause} t={t} />
```

Reference implementations: `BatchList.js`, `SessionPage.js` (both via `usePausablePolling`), `ExperimentalAnalysisPage.js` (via `usePauseToggle` + `guardPoll`, conditional poll). Static content that only refreshes as a one-off side effect of another action (not on a timer) doesn't need this.

`PauseToggleButton` renders a native `<button>`, not `<GcdsButton>` — see its own file comment for why (a `GcdsButton`/`aria-pressed` timing bug through the shadow DOM) — carrying a `TODO(design)` since a designer hasn't signed off on the visual treatment yet. Use the same native-button + `.filter-button-primary`/`.filter-button-outline` pattern for any other `aria-pressed` toggle button.
