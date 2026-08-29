# Coding Agent Instructions

## Environment notes
- **React build restriction**: Files imported by frontend code (`src/`) must live inside `src/`. Never place shared config intended for UI components in `config/` (root) — use `src/config/` instead. Server-side code (`api/`, `agents/`, `services/`) can import from anywhere.
- **Test runner**: This project uses **vitest**, not jest. Run tests with `npx vitest run <path>` (or `npm test` for all).
- **CSS/styling**: See [docs/coding-agent-docs/design-system.md](docs/coding-agent-docs/design-system.md) for all CSS and visual style rules.

## Commit messages and releases

Release Please reads Conventional Commit prefixes from commit messages on `main`.
Use one of: `feat`, `feature`, `fix`, `perf`, `revert`, `docs`, `style`, `chore`,
`refactor`, `test`, `build`, `ci` — e.g. `feat: add metadata backfill pagination`.
Branch names and PR comments do not trigger releases.

## Do not edit prompts during unrelated coding work

Everything under `agents/prompts/` (system prompt, `agenticBase.js`,
`citationInstructions.js`, `safety.js`, `contextSystemPrompt.js`, `scenarios/`) is
tuned by the prompt maintainers (Lisa Fast and Ryan Hyma) and validated with
evaluation batches before shipping.

Unless your task is **explicitly** prompt tuning directed by a maintainer:

- **Do not edit anything under `agents/prompts/`** as a side effect of other work.
- If a coding task seems to need a prompt change, **stop and flag it**: describe
  what should change and why, and let a maintainer decide. Don't work around it
  by editing a prompt.

## Never drop a prompt tag that code has to inject

Prompts refer to tags — `<referring-url>`, `<output-lang>`, `<searchResults>`,
`<final-turn>` — that **code** injects into the messages sent to the model. If code stops
supplying one, **nothing fails**: no error, no red test. The model just never sees the tag,
every instruction referencing it goes dead, and answers quietly get worse. (This happened
to `<referring-url>` in the graph/helper migration and went unnoticed for months.)

When changing anything that builds an agent's messages or payload:

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

**The same shape shows up outside prompts: any object rebuilt via `.map()`/spread that
only copies the fields the current mapper happens to read.** A field added upstream is
silently absent downstream, with no error (`src/App.js`'s route `.map()` dropped `handle`,
so `titleKey`/`skipRouteFocus` never reached the router). When a `.map()`/spread rebuilds
an object, diff the fields old vs. new, and add a test asserting the field survives.

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
13. **Search the codebase for an existing function before writing a new one — then check external packages.** Before generating a new file or hand-rolling an implementation, grep for whether this repo already has a util/hook/service that does it (e.g. `src/utils/htmlEscape.js` exists — don't write another `escapeHtml`). Only once internal reuse is ruled out, consider whether a well-maintained npm package already solves it.
14. **Keep PRs human-reviewable.** When a change is too large or wide-ranging for a reviewer to take in as one PR, flag it and work out the breakdown. Pieces that share a contract (a schema, a service, a type) need to be built and verified together before splitting for review; independent findings can just ship as their own small PRs as each is ready.

## Documentation Regeneration

When you change a **shared** prompt file in `agents/prompts/` — `agenticBase.js`, `safety.js`, `citationInstructions.js`, `scenarios-all.js`, the PII / translation / query-rewrite prompts, or `contextSystemPrompt.js` — regenerate the system prompt documentation:

```bash
node scripts/generate-system-prompt-documentation.js
```

This keeps `docs/agents-prompts/system-prompt-documentation.md` in sync.

**Department scenario files (`agents/prompts/scenarios/context-*/`) do NOT require regeneration** — the doc links to them rather than embedding them.

## Inspecting a chat run (debugging)

The ChatViewer page (`/en/chat-viewer`, admin/partner only) has a **"Download logs (JSON)"** button that exports the full graph event stream for a chatId. If the user hands you one of these files, parse it with:

```bash
node scripts/check-chat-logs.js <file.json>                          # full timeline
node scripts/check-chat-logs.js <file.json> --summary                # message-type counts only
node scripts/check-chat-logs.js <file.json> --filter similarQuestions # injected evals only
```

What lives in which event: [docs/architecture/using-evals-for-answers.md](docs/architecture/using-evals-for-answers.md#inspecting-what-was-injected-manual-testing).

## Official languages

See [docs/coding-agent-docs/official-languages.md](docs/coding-agent-docs/official-languages.md)
for the full ruleset: the core EN/FR requirement, `t()`/locale-key rules, the
`lang`-attribute rules (including the two-part Rule 1/Rule 2 split for
admin/eval tooling vs. the live conversation transcript), locale key parity,
number/percentage formatting, French punctuation spacing, and the PR review
checklist. Read it before creating or reviewing any user-facing text —
nearly every UI change touches at least one of these. Locale key hygiene and
the content style guide stay in this file.

### Content style guide

**Sentence case.** All text visible to users uses sentence case (only the first word and proper nouns capitalised). This applies to button labels, column headers, section titles, navigation links, and option labels. Examples: `"Upload file"` not `"Upload File"`, `"Processed batches"` not `"Processed Batches"`, `"Clarifying question"` not `"Clarifying Question"`.

When writing a non-trivial amount of new user-facing copy — a paragraph of explanatory text, an alert/warning/status message, a confirm-dialog body, anything longer than a short label — check it against the [Canada.ca content style guide](https://design.canada.ca/style-guide/index.html) (this is also where the sentence-case rule above comes from). Core rules that matter most for this codebase:
- **Plain language**: familiar words, active voice, positive phrasing over negative where possible (negative phrasing is fine for genuinely safety/data-loss-critical warnings, e.g. destructive-action confirms).
- **Short sentences**: aim under ~15–20 words each; split up anything longer rather than stacking clauses.
- **Second person, direct address**: "you"/"your" for the reader, "we" for the Government of Canada as a whole, where the copy is speaking to a person at all (not always applicable to terse admin/system copy).
- **No end punctuation on titles/headings/table captions** in English (French keeps its own punctuation rules — see [docs/coding-agent-docs/official-languages.md](docs/coding-agent-docs/official-languages.md)'s French punctuation spacing section).
- **Numbers**: digits for 10 and up, ages, dates, percentages; spell out zero to nine in narrative text.
Not necessary for single words, short labels, or an existing locale string you're not otherwise changing.

**Button-adjacent micro-confirmations are the exception to the "we"/full-sentence framing.** A `StatusMessage` right beside the button that fired it should be terse and echo the button's verb: `"Referring URL applied."` (matching `"Apply URL"`), not `"We've applied the referring URL."`. Full sentences are for page-level outcomes with distance from their trigger (e.g. `signup.pending`).

### Locale key hygiene

**Before adding a locale key, grep `en.json` for the English string.** Generic text ("cleared", "no data", "loading") usually already has a shared key (e.g. `common.noDataForFilters`). Adding `admin.evalDashboard.fooAnnouncement` with the same value as `admin.chatDashboard.fooAnnouncement` is the bug this prevents — check *before* writing the key, not via the detector after.

**`common.*` is site-wide (admin pages *and* the public chat UI in `src/components/chat/`). Admin-only shared text goes in `admin.common.*`.** Keeping the namespaces apart means an edit "for the admin dashboards" can't reach public chat text, and vice versa.

After adding, removing, or renaming locale keys, run the dead key detector as a backstop:

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

Both render through `useMarkdownWithFrontmatter` — see
[docs/coding-agent-docs/common-tasks.md](docs/coding-agent-docs/common-tasks.md#markdown-driven-pages)
for the frontmatter contract and how to add a how-to guide.

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

**Never put `role="status"`/`aria-live` on a message, box, or overlay you render conditionally.** A live region inserted into the DOM with its text already in it is dropped by screen readers (VoiceOver especially), so it's silent — and nothing fails, no test goes red. Every announcement goes through the one always-mounted announcer in `src/utils/liveAnnouncer.js`: `StatusMessage`/`LoadingOverlay` do it for you; for an outcome with nothing visible to show, call `announce(text)` directly. The doc explains the mechanism, `nonce`, `announce={false}` for focus-moved messages, and how to test it (`test/liveAnnouncer.js`'s `waitForAnnouncement`, not `findByRole('alert')`).

## Admin page nav landmark

Every admin/partner page's "back to admin" `<nav>` needs an `aria-label`, or screen-reader users navigating by landmark get an unlabeled region (and, on pages with more than one `<nav>`, indistinguishable ones):

```jsx
<nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
  <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
</nav>
```

This is copy-pasted onto every admin page rather than centralized — don't forget it on a new admin page.

## UI architecture and folders

For UI work, follow the layered pattern:

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
