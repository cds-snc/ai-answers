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

## No inline styles

Do not use inline `style={{...}}` attributes on elements. Add a CSS class instead.

Inline styles are only acceptable when the value is genuinely dynamic and cannot be expressed as a class (e.g. a runtime-computed width or colour).

## Styling hierarchy

When adding any style, follow this order — stop at the first option that works:

1. **GC DS utility class** — covers the need with a single class, no new CSS required
2. **GC DS token** — no utility class fits, but a `var(--gcds-*)` token covers the value
3. **Hardcoded value** — no token exists; leave a short comment so a designer can review it later

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

For each finding, include:
- The class name(s) affected
- The page(s) where those classes are visually rendered, so changes can be verified in the browser after implementation (e.g. "visible on `/en/admin/dashboard` — exec dashboard cards")

## GCDS React components

Prefer building UI elements with CSS shortcuts over GCDS React components. CSS shortcuts produce standard HTML elements that can be tracked with analytics; GCDS React components cannot yet. Avoid introducing new GCDS React components — existing usage can be backtracked as necessary.

**Exception for complex patterns behind admin auth.** On admin/partner-only pages (not public-facing), since these are internal tools where tracking through analytics isn't a requirement, and ensuring the ability to refine UX behaviour for complex chat interactions isn't a factor. For a component with significant built-in behaviour that would be substantial and error-prone to hand-roll correctly (e.g. `gcds-file-uploader`'s drag-drop, file list/remove UI, validation states, and ARIA wiring), it's reasonable to adopt the GCDS React component directly rather than reimplementing it with CSS shortcuts or GC DS tokens, over a raw HTML element. Still avoid it for simple elements (links, buttons, headings) where a CSS shortcut is just as easy and keeps analytics tracking intact.
