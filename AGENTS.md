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

See [docs/coding-agent-docs/official-languages.md](docs/coding-agent-docs/official-languages.md)
for the full ruleset: the core EN/FR requirement, `t()`/locale-key rules, the
`lang`-attribute rules (including the two-part Rule 1/Rule 2 split for
admin/eval tooling vs. the live conversation transcript), locale key parity,
number/percentage formatting, French punctuation spacing, and the PR review
checklist. Read it before creating or reviewing any user-facing text —
nearly every UI change touches at least one of these. Two related things
stay in this file instead: locale key *hygiene* below (the fuller practice
around adding/reusing/namespacing keys — general maintenance practice, not
itself an OL rule, even though the parity it protects is), and the content
style guide (writing quality, not a bilingual/legal requirement at all).

### Content style guide

**Sentence case.** All text visible to users uses sentence case (only the first word and proper nouns capitalised). This applies to button labels, column headers, section titles, navigation links, and option labels. Examples: `"Upload file"` not `"Upload File"`, `"Processed batches"` not `"Processed Batches"`, `"Clarifying question"` not `"Clarifying Question"`.

When writing a non-trivial amount of new user-facing copy — a paragraph of explanatory text, an alert/warning/status message, a confirm-dialog body, anything longer than a short label — check it against the [Canada.ca content style guide](https://design.canada.ca/style-guide/index.html) (this is also where the sentence-case rule above comes from). Core rules that matter most for this codebase:
- **Plain language**: familiar words, active voice, positive phrasing over negative where possible (negative phrasing is fine for genuinely safety/data-loss-critical warnings, e.g. destructive-action confirms).
- **Short sentences**: aim under ~15–20 words each; split up anything longer rather than stacking clauses.
- **Second person, direct address**: "you"/"your" for the reader, "we" for the Government of Canada as a whole, where the copy is speaking to a person at all (not always applicable to terse admin/system copy).
- **No end punctuation on titles/headings/table captions** in English (French keeps its own punctuation rules — see [docs/coding-agent-docs/official-languages.md](docs/coding-agent-docs/official-languages.md)'s French punctuation spacing section).
- **Numbers**: digits for 10 and up, ages, dates, percentages; spell out zero to nine in narrative text.
It's a useful sanity check for any user-facing copy, not just long-form text — just not necessary for single words, short labels, or an existing locale string you're not otherwise changing.

**Don't over-apply the "we"/full-sentence framing to button-adjacent micro-confirmations.** The active-voice/second-person guidance above is for page-level outcomes with some distance from their trigger — a signup's pending-approval state, a password-reset confirmation, something the user might read a moment after acting. A `StatusMessage` sitting immediately next to the button that just fired (an Apply/Clear/Save right beside it) needs the opposite instinct: as terse as possible, and echoing the *same verb* the button itself uses, not a full sentence restating what happened. `"Referring URL applied."`/`"Referring URL cleared."` (matching `"Apply URL"`/`"Clear URL"`) is correct; `"We've applied the referring URL."` is the wrong register for that spot, even though it's the right one for `signup.pending`. Check which of the two a given message actually is — full-sentence "we" framing is not a blanket default for every success/error message in the app.

### Locale key hygiene

**Before adding a new locale key, check whether one already says the same thing.** For generic, non-page-specific text (status messages, announcements, common labels like "cleared", "no data", "loading"), grep `en.json` for the English string first — `common.*` already holds several of these (e.g. `common.noDataForFilters`) precisely so multiple pages/dashboards share one key instead of each defining its own copy. Adding a second key with an identical value under a page-specific namespace (e.g. `admin.evalDashboard.fooAnnouncement` duplicating `admin.chatDashboard.fooAnnouncement`) is the bug this section exists to prevent — do the reuse check *before* writing the key, not after, via the detector below. This has shipped more than once from copy-pasting an existing page's pattern into a new page without checking if the string itself could just be shared.

**`common.*` is site-wide, not admin-only — don't reuse it for admin-dashboard strings.** `common.*` is genuinely shared across both admin pages and the public-facing chat UI (`src/components/chat/`) — `common.yes`/`common.no`, `common.loading`, `common.error`, `common.close`, etc. are all used by public chat components, not just admin tooling. Shared text that only ever applies to admin dashboards (search labels/placeholders, "no results", "filters cleared", column-header conventions, etc.) belongs in **`admin.common.*`** instead — a separate namespace kept deliberately apart from `common.*` so a future edit made "for the admin dashboards" can never accidentally reach into text the public chat UI also depends on, and vice versa. When consolidating a duplicate that's genuinely admin-only, reuse/add to `admin.common.*`; only reach for top-level `common.*` when the string is (or plausibly could be) shared with the public chat experience too.

After adding, removing, or renaming locale keys, also run the dead key detector as a backstop:

```bash
node scripts/find-dead-locale-keys.cjs
```

This reports:
1. **Dead keys** — keys in `en.json`/`fr.json` with no detected usage in `src/`
2. **Duplicate keys** — different keys with identical values (consolidation candidates)
3. **Parity gaps** — keys present in EN but missing from FR, or vice versa — this is the OL requirement itself (see [docs/coding-agent-docs/official-languages.md](docs/coding-agent-docs/official-languages.md)); the other two are general hygiene.

Parity gaps must be fixed before merging. Dead keys and duplicates are cleaned up incrementally — fix a few per PR rather than all at once.

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
- **Any server-side paginated/searchable table, dashboard or not (which wrapper to use, migrating a hand-rolled table):** [docs/coding-agent-docs/tables.md](docs/coding-agent-docs/tables.md)
- **CSS, styling, visual look and feel, GC Design System tokens:** [docs/coding-agent-docs/design-system.md](docs/coding-agent-docs/design-system.md)
- **Creating or reviewing user-facing text (copy, labels, error messages, locale keys, `lang` attributes):** [docs/coding-agent-docs/official-languages.md](docs/coding-agent-docs/official-languages.md)
- **Rendering a save/delete/import/export/loading outcome, sr-only announcement, or form validation error:** [docs/coding-agent-docs/status-and-error-messaging.md](docs/coding-agent-docs/status-and-error-messaging.md)

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

Read [docs/coding-agent-docs/status-and-error-messaging.md](docs/coding-agent-docs/status-and-error-messaging.md) before rendering any save/delete/import/export/test-run/upload outcome, autosave failure, loading state, sr-only announcement, or form validation error. The short version: use `src/components/admin/StatusMessage.js` for page/section-level outcomes with no single input they belong to, and the form-error family (`AnnouncedError.js`/`FeedbackInlineError.js`/`ExplanationErrorSummary.js`) for anything tied to a specific field — don't hand-roll a plain `<div>`/`<p>`/`alert()` for either. Never show a raw `err.message`/`error.message` directly to the user; the doc covers why and the two established alternatives.

**Never show a raw `err.message`/`error.message` directly to the user.** It's the literal,
untranslated text a JS `Error` or `fetch()` rejection happened to carry (`"Failed to fetch"`,
a driver's internal message, etc.) — always English regardless of the user's language, and
often irrelevant or confusing to show verbatim. `err.message || t('some.fallback')` doesn't
protect against this: `.message` is essentially always truthy on a real `Error`, so the
translated fallback can never actually fire. Two established alternatives, depending on
whether the raw detail is worth keeping:

1. **A stable backend `code`, not free text.** Have the backend return a small, fixed `code`
   field and map that through a local object to a `t()` key client-side — use the shared
   `resolveErrorMessage()` helper (`src/utils/errorCodeMessage.js`) rather than hand-rolling
   the map/lookup per call site (see `ResetCompletePage.js`).
2. **Wrap the raw detail in `<code lang="en">`.** If the raw detail itself is genuinely useful
   to show (admin/diagnostic tooling especially — a fetch failure, an export error), split the
   translated template around the placeholder and wrap only that portion, e.g.
   `<>{prefix}<code lang="en">{error.message}</code>{suffix}</>` — see `DeleteChatSection.js`'s
   `resolveLook()`. `<code>` (not `<span>`) both gets the correct `lang="en"` pronunciation for
   AT *and* the existing global `code { font-family: monospace... }` style for sighted users,
   so raw/technical output reads as visually distinct from prose — free, no new CSS. On a page
   with several of these (e.g. `DatabasePage.js`'s ~13 operations), pull the split/wrap and the
   render into two small local helpers instead of repeating the shape per state — see
   `DatabasePage.js`'s `buildErrorStatus`/`renderStatusMessage`.

A `t()` string with a `{placeholder}` substituted via `.replace()`/interpolation (the pattern
just above) is *not* equivalent to option 2: `t()` returns a plain string, which can't embed
an HTML element, so the substituted text has no way to get `lang="en"` — and no code styling
either — and stays unmarked regardless of how carefully the `.replace()` call itself is
written.

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
