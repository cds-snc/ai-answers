# Coding Agent Instructions

## Environment notes
- **React build restriction**: Files imported by frontend code (`src/`) must live inside `src/`. Never place shared config intended for UI components in `config/` (root) — use `src/config/` instead. Server-side code (`api/`, `agents/`, `services/`) can import from anywhere.
- **Test runner**: This project uses **vitest**, not jest. Run tests with `npx vitest run <path>` (or `npm test` for all).
- **CSS/styling**: See [docs/coding-agent-docs/design-system.md](docs/coding-agent-docs/design-system.md) for all CSS and visual style rules.

## Commit messages and releases

Release Please runs on pushes to `main` and uses Conventional Commit prefixes
from the commit message. When creating a commit, use one of the configured
prefixes:

`feat`, `feature`, `fix`, `perf`, `revert`, `docs`, `style`, `chore`,
`refactor`, `test`, `build`, or `ci`.

For example: `feat: add metadata backfill pagination` or
`fix: prevent backfill timeout`. Branch names and pull request comments do not
trigger releases. The generated release pull request uses the branch
`release-please--branches--main` and a title such as
`chore: AI Answers release v1.171.0`.

## Do not edit prompts during unrelated coding work

Prompt files in `agents/prompts/` — the system prompt, `agenticBase.js`,
`citationInstructions.js`, `safety.js`, `contextSystemPrompt.js`, and the
`scenarios/` files — are tuned through a dedicated process: changes are made by
the prompt maintainers (Lisa Fast and Ryan Hyma) and validated by running
evaluation **batches** before they ship. They may ask for assistance tuning prompts.

So unless your task is **explicitly** prompt tuning directed by a maintainer:

- **Do not edit anything under `agents/prompts/`** as a side effect of other work.
- If a coding task seems to need a prompt change to work, **stop and flag it**:
  describe what you think needs to change and why, and let a maintainer decide.
  Do not make the edit yourself, and do not work around it by editing a prompt.

This applies to all coding work — bug fixes, refactors, new features,
dashboards — not just prompt-adjacent areas.

## Never drop a prompt tag that code has to inject

Prompts refer to tags — `<referring-url>`, `<output-lang>`, `<searchResults>`,
`<final-turn>` — that **code** has to inject into the messages sent to the model. The
prompt names the tag; the message-building code supplies it. If code stops supplying one,
**nothing fails**: no error, no thrown exception, no red test. The model simply never sees
the tag, every instruction referencing it goes dead, and answers quietly get worse. This
is the hardest class of bug to notice in this codebase.

So, when changing anything that builds an agent's messages or payload:

- **Never remove a field from a message/payload because it looks unused.** It is almost
  certainly consumed by a prompt, not by JS. Grep the prompt files for the tag first.
- **Carry every tag through a refactor.** When moving or rewriting message-building code,
  diff the old and new versions for tags and payload fields before you finish.
- Build every tag with the shared helpers in `api/util/prompt-tags.js` rather than
  inlining the string. Two paths attach `<referring-url>`:
  `services/ContextAgentService.js` (context agent) and
  `GraphWorkflowHelper.sendAnswerRequest` (answer agent). A value can also be lost one
  step earlier by not being *forwarded* — `GraphWorkflowHelper.deriveContext` passes
  `referringUrl` into the context payload but builds no tag itself; both links have to
  hold.
- Cover the tag with a test asserting it appears in the outgoing message — see
  `services/__tests__/ContextAgentService.test.js` and the `sendAnswerRequest` block in
  `agents/graphs/workflows/__tests__/GraphWorkflowHelper.test.js`. This is the only thing
  that turns a silent regression into a loud one.

Worked example: `<referring-url>` was passed to the context agent by the old
`services/ContextService.js`, then lost in the migration to the graph/helper architecture.
`contextSystemPrompt.js` kept telling the model to prioritize `<referring-url>` over
`<searchResults>` — but the tag was never in the input, so the instruction did nothing and
the agent matched departments off search results alone. It went unnoticed for months
because no test and no error covered it.

## How to work well in this codebase

1. **State assumptions early.** Before implementing anything non-trivial, say what you're assuming so we can catch misalignment before code is written.
2. **Pause on ambiguity.** If you hit inconsistencies, conflicting requirements, or unclear specs, surface the tradeoff or ask for clarification rather than guessing.
3. **Push back when it helps.** If the human's approach has clear problems, point it out directly and propose an alternative. Agreeing to avoid friction wastes everyone's time.
4. **Keep it simple.** Favour the boring, obvious solution. If 100 lines would do and you wrote 1000, something went wrong.
5. **Stay scoped.** Avoid removing comments you don't understand, "cleaning up" code orthogonal to the task, refactoring adjacent systems as side effects, or deleting code that seems unused without asking first.
6. **Flag dead code.** After refactoring or implementing changes, point out code that's now unreachable and ask what to do with it.
7. **Clarify success criteria.** If instructions don't include them, reframe the goal explicitly so you can loop, retry, and problem-solve rather than following steps that may not lead anywhere.
8. **Test-first for non-trivial logic.** Write the test that defines success, implement until it passes, then show both.
9. **Run existing tests after changes.** After modifying code, run the relevant test suite (`npm test` or the specific test file) to catch regressions before considering the task done.
10. **Check for downstream impact.** After changing a shared function, utility, or service, trace its callers to verify the change doesn't break other consumers. Don't assume the only usage is the one you're fixing.
11. **Prefer central fixes for shared semantics.** If the same derived value, metric, category, or business rule appears in multiple dashboards/pages/components, first look for the shared API, service, hook, helper, or data contract that should define it. Avoid patching each UI consumer with duplicate compensating logic unless the difference is intentionally presentation-specific.
12. **Prefer fail-fast contracts.** Avoid permissive input handling that guesses between multiple runtime shapes. If a function needs different input forms, make the contract explicit with separate methods, clear types, or strict runtime validation, and fail loudly when the wrong shape arrives.

## Documentation Regeneration

When you change a **shared** prompt file in `agents/prompts/` — `agenticBase.js`, `safety.js`, `citationInstructions.js`, `scenarios-all.js`, the PII / translation / query-rewrite prompts, or `contextSystemPrompt.js` — regenerate the system prompt documentation:

```bash
node scripts/generate-system-prompt-documentation.js
```

This keeps `docs/agents-prompts/system-prompt-documentation.md` in sync with the actual prompts.

**Department scenario files do NOT require regeneration.** Changes to any `agents/prompts/scenarios/context-*/` file (partner department scenarios, which change frequently on partner request) never affect the generated documentation: the doc links to those files rather than embedding their contents. Do not run the generator for scenario-file changes.

## Inspecting a chat run (debugging)

The ChatViewer page (`/en/chat-viewer`, `/fr/visualiseur-de-clavardage`, admin/partner only) has a **"Download logs (JSON)"** button that exports the full graph event stream for any chatId — local, staging, or prod — as a self-describing JSON file: `{ chatId, exportedAt, logCount, logs[] }`.

If the user hands you one of these files (e.g. to diagnose a bad answer or see what evals were injected), parse it with:

```bash
node scripts/check-chat-logs.js <file.json>                          # full timeline
node scripts/check-chat-logs.js <file.json> --summary                # message-type counts only
node scripts/check-chat-logs.js <file.json> --filter similarQuestions # injected evals only
```

What lives in which event: see [docs/architecture/using-evals-for-answers.md](docs/architecture/using-evals-for-answers.md#inspecting-what-was-injected-manual-testing). Key ones: `node:context output` (matched department/topic), `node:similarQuestions output` (injected eval text in `metadata.similarQuestionsText`), `node:answer input/output` (what reached the LLM, what came back), `node:shortCircuit output` (whether the instant-answer path fired).

## Official languages
**English users and admins and partners must be served in English. French users and admins and partners must be served in French.** This applies to all pages and tools — public-facing, admin, and partner.

**Never hardcode user-facing text in components or pages.** All text visible to users must use translation keys via `t()` and have entries in both `src/locales/en.json` and `src/locales/fr.json`. When adding any new text (column headers, labels, buttons, messages, placeholders, error messages, status messages, option labels, etc.), always add the corresponding key to both locale files in the same PR — don't rely on the fallback string in `t('key', 'fallback')` or `t('key') || 'fallback'`.

### Exceptions
- **Backend/console/database output**: `console.log`, `console.error`, server-side log strings, developer-facing CLI output, and dynamic content retrieved from the database are exempt.
- **Internal technical identifiers used as option values**: e.g. workflow names like `GenericGraph` where the value and label are the same internal enum — these are not user-facing text.

### Sentence case
All text visible to users uses sentence case (only the first word and proper nouns capitalised). This applies to button labels, column headers, section titles, navigation links, and option labels. Examples: `"Upload file"` not `"Upload File"`, `"Processed batches"` not `"Processed Batches"`, `"Clarifying question"` not `"Clarifying Question"`.

### Locale key hygiene
After adding, removing, or renaming locale keys, run the dead key detector:

```bash
node scripts/find-dead-locale-keys.cjs
```

This reports:
1. **Dead keys** — keys in `en.json`/`fr.json` with no detected usage in `src/`
2. **Duplicate keys** — different keys with identical values (consolidation candidates)
3. **Parity gaps** — keys present in EN but missing from FR, or vice versa

Parity gaps must be fixed before merging. Dead keys and duplicates are cleaned up incrementally — fix a few per PR rather than all at once.

### Number and percentage formatting

**This is an Official Languages requirement.** French and English have different conventions for numbers and percentages (`1 000` vs `1,000`; `45 %` vs `45%`). Any component or page that displays numeric data to users must format numbers and percentages using the shared helpers in `src/utils/numberFormat.js`:

```js
import { formatNumber, formatPercent } from '../../utils/numberFormat.js';

const fmtN = (n) => formatNumber(n, lang);   // 1 000 (fr) / 1,000 (en)
const fmtPct = (n) => formatPercent(n, lang); // 45 % (fr) / 45% (en)
```

- **`formatNumber(n, lang)`** — formats integers and large numbers with the correct thousands separator (`fr-CA` uses non-breaking space, `en-CA` uses comma). Handles `null`/`undefined` → `0`.
- **`formatPercent(n, lang)`** — appends `%` with a non-breaking space before it in French (`45 %`), no space in English (`45%`). Takes an already-computed integer (0–100), not a fraction.
- **`formatDecimal(n, lang, fractionDigits = 3)`** — formats a decimal number with locale-aware separators (`,` vs `.`) and a fixed number of decimal places. Pass-through for `null`/`undefined`/empty/non-numeric values.

Rules:
- Never use `+ '%'`, `'0%'`, or `'100%'` as literal strings in data displayed to users — always go through `fmtPct`.
- Never use `n.toFixed(d)` or inline `Intl.NumberFormat` for decimal values displayed to users — always go through `formatDecimal`.
- For DataTables columns with sorting enabled, pass raw numbers in the data object and use the `render: (d, type) => type === 'display' ? fmtN(d) : d` pattern so sorting operates on the raw value.
- These helpers apply to dashboards, tables, batch lists, and any other UI that surfaces counts, totals, or percentages.

### French punctuation spacing
French requires a space before `:`, `;`, `!`, and `?` (e.g. `"Assigné à :"`, `"Continuer ?"`) — English does not. This has slipped through review before in two forms:
- A static `fr.json` string typed without the space (e.g. `"...utile?"` instead of `"...utile ?"`).
- JS that hardcodes punctuation while building a label at runtime (e.g. `` `${label}: ${value}` ``) instead of putting the full punctuated phrase in the locale string. If code needs one literal separator shared across both languages, prefer a mark that doesn't have a French spacing rule (e.g. `" - "`) rather than `":"`/`"?"`/`"!"`.

### PR review checklist — official languages
Every PR that touches UI components, pages, or locale files must be verified against these before merging.

**Must fix before merging:**
- [ ] No hardcoded user-facing strings in components or pages (no `'English text'` literals, no `|| 'fallback'` patterns, no `lang === 'en' ? '...' : '...'` inline conditionals)
- [ ] All translation calls use `t()` or `safeT()` — not raw string literals (`safeT` is a wrapper around `t()` used in chat components that unwraps object results to a plain string; same locale key rules apply)
- [ ] Every new `t('key')` call has a matching entry in **both** `en.json` and `fr.json`
- [ ] `node scripts/find-dead-locale-keys.cjs` reports **0 parity gaps**
- [ ] French translations are real translations — not copied English text or placeholders
- [ ] All numbers displayed to users go through `formatNumber(n, lang)` — no raw `.toLocaleString()`, `toString()`, or unformatted numeric values
- [ ] All percentages displayed to users go through `formatPercent(n, lang)` — no `+ '%'`, `'0%'`, or `'100%'` string literals
- [ ] French text has a space before `:`, `;`, `!`, `?` — check both static `fr.json` values and any JS that concatenates punctuation onto a label at runtime

**Flag but don't block:**
- Sentence case is generally preferred for all text visible to users — note inconsistencies (e.g. mid-sentence capitals, ALL-CAPS emphasis) in review and fix opportunistically

### Markdown-driven pages

Some pages get their text from markdown files under `public/content/`, not from
the locale files. Edit the markdown, not the component — and always both languages:

- **About page** — `public/content/about-en.md` / `about-fr.md`
- **Admin how-to guides** — `public/content/admin/`, one file per language, with
  screenshots in `public/content/admin/images/`

Both render through `useMarkdownWithFrontmatter`. See
[docs/coding-agent-docs/common-tasks.md](docs/coding-agent-docs/common-tasks.md#markdown-driven-pages)
for the frontmatter contract, how to add a new how-to guide, and the GCDS list
reset that markdown rendering has to work around.

System card has EN and FR versions — always update both:
 *   - English: SYSTEM_CARD.md
 *   - French:  SYSTEM_CARD_FR.md

## Reference docs for coding tasks

Before starting work, read the relevant reference doc:

- **Backend/pipeline/agent/service changes:** [docs/coding-agent-docs/architecture-quick-ref.md](docs/coding-agent-docs/architecture-quick-ref.md)
- **Writing or running tests, local dev:** [docs/coding-agent-docs/testing-and-dev.md](docs/coding-agent-docs/testing-and-dev.md)
- **Common task patterns (prompts, UI, scenarios, API):** [docs/coding-agent-docs/common-tasks.md](docs/coding-agent-docs/common-tasks.md)
- **Dashboards & filters (exec/partner cards, `FilterPanel`, cross-dashboard filter logic, Chat/Eval/Metrics gotchas):** [docs/coding-agent-docs/dashboards.md](docs/coding-agent-docs/dashboards.md)
- **CSS, styling, visual look and feel, GC Design System tokens:** [docs/coding-agent-docs/design-system.md](docs/coding-agent-docs/design-system.md)

## Database query safety

### AWS DocumentDB compatibility

Production uses **AWS DocumentDB 8**, which exposes a MongoDB-compatible API but is not a full MongoDB implementation. When changing database queries or persistence code:

- Do not assume that every MongoDB operator, aggregation stage, index behavior, bulk-operation behavior, or transaction semantic is supported identically by DocumentDB.
- Prefer query shapes and features documented as supported by DocumentDB 8, and validate important or new queries with DocumentDB's `explain("executionStats")` rather than relying only on local MongoDB tests.
- Account for DocumentDB network round-trip costs: batch reads and writes where practical, avoid unbounded per-record database calls, and use bounded concurrency for maintenance jobs.
- Verify that required indexes exist in the deployed DocumentDB cluster; Mongoose schema declarations alone do not prove that production indexes are present.

When building Mongo/Mongoose queries from request data or other user-controlled input, normalize the value before placing it in a query predicate. Do not rely on Mongoose casting or filter sanitization to prove the query is safe for CodeQL.

Use the shared helpers in `api/util/db-query.js`:

```js
import { requireObjectIdString, requireLiteralString, requireString } from '../util/db-query.js';
```

Use `requireObjectIdString(value, fieldName)` for ObjectId-backed fields, `requireLiteralString(value, fieldName)` for exact-match string fields that will be used directly in a query, and `requireString(value, fieldName)` for plain string fields such as generated UUID-style IDs.

Normalize user-controlled query values by assigning back to the existing variable before the query. Prefer `chatId = requireString(chatId, 'chatId')` over introducing `safeChatId` / `safe*` variables unless a separate raw value is genuinely needed later.

Keep existing route error contracts unless the task explicitly asks to change them. In most alert-cleanup work, let helper-thrown errors fall through the endpoint's existing `catch` block instead of adding new invalid-ID/status branches.

## Adding new pages

When adding a new page, register its route in `src/utils/routes.js` under `ROUTE_SLUGS` with both English and French slugs:

```js
'my-new-page': { en: 'my-new-page', fr: 'ma-nouvelle-page' },
```

French slugs must be real translations — not copied English slugs. Once registered, use `getPath('my-new-page', lang)` to generate links and `ROUTE_SLUGS['my-new-page']` to define the route in `App.js`. Never hardcode URL paths as strings elsewhere in the codebase.

## Announcing status, errors, and async outcomes

Use `src/components/admin/StatusMessage.js` for any save/delete/import/export/test-run/upload outcome, autosave failure, loading state, or async result on an admin page — don't hand-roll a plain `<div>`/`<p>`/`alert()` for this. A lot of the admin section had these render as plain DOM text (or a native `alert()` popup) with no ARIA role at all, so screen-reader users got zero indication anything happened; this component is the fix, standardized in one place instead of reinvented per page.

```jsx
import StatusMessage from '../components/admin/StatusMessage.js';

<StatusMessage message={statusMessage?.text} isError={statusMessage?.isError} />
// in-progress state, not a completed result — same component, own sub-type:
<StatusMessage loading message={t('some.page.loading')} />
```

It renders `role="alert"`/`aria-live="assertive"` when `isError`, otherwise `role="status"`/`aria-live="polite"`. Pass `null`/`undefined`/`''` as `message` to render nothing. Pass `id` when another element needs to reference it via `aria-describedby` (e.g. a disabled button explaining why).

Known gap (tracked as a TODO in the component itself): it only standardizes the ARIA behaviour so far — callers still each pass their own inline `style` for colour/spacing, and there's no styled variant per message type yet. Don't add another one-off inline style; if you need visual treatment beyond the default, flag it rather than copying an existing page's ad-hoc hex colours.

**Interpolating dynamic text (e.g. `error.message`) into a translated template:** don't pass it as the 2nd argument to `String.replace('{placeholder}', dynamicText)` — that argument is a *replacement pattern*, not a literal string, so a `$` sequence in the dynamic text (common in stack traces) gets silently misread as a special token (`$&`, `` $` ``, `$'`, `$$`) and corrupts the message. Use the replacer-*function* form instead, which is used verbatim:

```js
t('admin.deleteChat.error').replace('{message}', () => error.message || String(error))
```

## Admin page nav landmark

Every admin/partner page's "back to admin" `<nav>` needs an `aria-label`, or screen-reader users navigating by landmark get an unlabeled region (and, on pages with more than one `<nav>`, indistinguishable ones):

```jsx
<nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
  <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
</nav>
```

This is currently copy-pasted onto every admin page rather than centralized into a shared nav/breadcrumb component — don't forget it when adding a new admin page, and feel free to fold it into a shared component if you're touching several of these at once.

## UI architecture and folders

For UI work, follow the layered pattern below so data flow and responsibilities stay clear:

1. **Service ->** API calls and raw response handling (`fetch`, endpoint URLs, request/response shape)
2. **Hook ->** stateful UI logic that consumes services (`loading`, `error`, refresh, memoized derived state)
3. **Component ->** reusable/presentational UI blocks
4. **Page ->** route-level composition only (wire hooks/components together, keep business logic thin)

### Folder convention for page-specific UI work

Use high-level folders by type, then a page/feature subfolder:

- `src/pages/<PageName>.js` for the route page
- `src/hooks/<feature>/` for hooks used by that page/feature
- `src/components/<feature>/` for components used by that page/feature
- `src/utils/<feature>/` for pure helpers used by that page/feature

Example (ChatViewer):

- `src/pages/ChatViewer.js`
- `src/hooks/chatviewer/...`
- `src/components/chatviewer/...`
- `src/utils/chatviewer/...`

Notes:

- Prefer putting logic in a hook before moving it to the page.
- Keep utils pure (no React state/effects); move stateful logic to hooks.
- If a hook/component/helper becomes cross-feature, promote it to a shared location and update imports.

## Key rules
- Department abbreviations (abbrKey) are defined in `agents/prompts/scenarios/departments_EN.js` / `departments_FR.js` — never invent new ones
- Pipeline is a LangGraph state machine in `agents/graphs/` — understand node flow before modifying
- `agents/prompts/systemPrompt.js` assembles the final prompt from `agenticBase.js` + `citationInstructions.js` + scenarios — read it to understand prompt composition
- Department scenario loading depends on the context node: `contextSystemPrompt.js` runs first (via ContextAgentService) to match the user's question to a department abbrKey, and ONLY then does `systemPrompt.js` use that matched abbrKey to dynamically import the corresponding `context-{abbrKey}/` scenario. No context match → no department scenario loaded.
