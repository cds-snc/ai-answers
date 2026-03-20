# Claude Code Instructions

## Environment notes
- `gh` CLI is not installed — use `WebFetch` for GitHub PR/issue details instead.

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

## Documentation Regeneration

When any file in `agents/prompts/` is changed (except department scenarios in `agents/prompts/scenarios/context-*/`), regenerate the system prompt documentation:

```bash
node scripts/generate-system-prompt-documentation.js
```

This keeps `docs/agents-prompts/system-prompt-documentation.md` in sync with the actual prompts.

## Official languages
**English users and admins and partners must be served in English. French users and admins and partners must be served in French.** This applies to all pages and tools — public-facing, admin, and partner.

**Never hardcode user-facing text in components or pages.** All UI strings must use translation keys via `t()` and have entries in both `src/locales/en.json` and `src/locales/fr.json`. When adding any new UI text (column headers, labels, buttons, messages, placeholders, error messages, status messages, option labels, etc.), always add the corresponding key to both locale files in the same PR — don't rely on the fallback string in `t('key', 'fallback')` or `t('key') || 'fallback'`.

### Exceptions
- **User chat logs**: chat message content stays in the user's language of choice — do not translate it.
- **Backend/console output**: `console.log`, `console.error`, server-side log strings, and developer-facing CLI output are exempt.
- **Internal technical identifiers used as option values**: e.g. workflow names like `DefaultGraph` where the value and label are the same internal enum — these are not human-readable UI text.

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

### PR review checklist — official languages
Every PR that touches UI components, pages, or locale files must be verified against these before merging.

**Must fix before merging:**
- [ ] No hardcoded user-facing strings in components or pages (no `'English text'` literals, no `|| 'fallback'` patterns, no `lang === 'en' ? '...' : '...'` inline conditionals)
- [ ] All translation calls use `t()` or `safeT()` — not raw string literals (`safeT` is a wrapper around `t()` used in chat components that unwraps object results to a plain string; same locale key rules apply)
- [ ] Every new `t('key')` call has a matching entry in **both** `en.json` and `fr.json`
- [ ] `node scripts/find-dead-locale-keys.cjs` reports **0 parity gaps**
- [ ] French translations are real translations — not copied English text or placeholders

**Flag but don't block:**
- Sentence case is generally preferred for all text visible to users — note inconsistencies (e.g. mid-sentence capitals, ALL-CAPS emphasis) in review and fix opportunistically

About page is different - text content is in .md files
 *   - English: public/content/about-en.md
 *   - French:  public/content/about-fr.md

System card has EN and FR versions — always update both:
 *   - English: SYSTEM_CARD.md
 *   - French:  SYSTEM_CARD_FR.md

## Reference docs for coding tasks

Before starting work, read the relevant reference doc:

- **Backend/pipeline/agent/service changes:** [docs/coding-agent-docs/architecture-quick-ref.md](docs/coding-agent-docs/architecture-quick-ref.md)
- **Writing or running tests, local dev:** [docs/coding-agent-docs/testing-and-dev.md](docs/coding-agent-docs/testing-and-dev.md)
- **Common task patterns (prompts, UI, scenarios, API):** [docs/coding-agent-docs/common-tasks.md](docs/coding-agent-docs/common-tasks.md)

## FilterPanel and filter logic
When changing `FilterPanel.js` or the backend filter logic in `getChatFilterConditions` (`api/util/chat-filters.js`), you must verify the change works across **all consumers**:
- **ChatDashboardPage** (`api/chat/chat-dashboard.js`)
- **EvalDashboardPage** (`api/eval/eval-dashboard.js`) — aggregates from `Interaction` with `basePath: ''` and `userField: 'chatUser'`; `referringUrl` may be stored without protocol prefix
- **AutoEvalDashboardPage** (`api/eval/eval-dashboard.js`, same backend)
- **MetricsDashboard** (`api/metrics/metrics-common.js` + individual metric endpoints)
- **Export/Download** (`api/chat/chat-export-logs.js`) — has a `$lookup` that overwrites `user`; user-type filter must be applied early in `dateFilter` before the overwrite

Each consumer has a different aggregation pipeline shape. A regex or filter condition that works on one may fail on another due to different field paths, `$lookup` ordering, or stored data formats.

## Dashboard gotchas
- **DataTables `stateSave`**: When changing column `searchable`/`orderable` settings, bump the `TABLE_STORAGE_KEY` version — stale localStorage can silently apply old column filters that no longer have visible inputs.
- **Eval dashboard aggregates from `Interaction`, not `Chat`**: Fields from the parent chat (like `user`, `chatId`, `pageLanguage`) must be `$lookup`'d and extracted. The `user` field lives on `Chat`, so in the eval pipeline it's `chatUser` — pass `userField: 'chatUser'` to `getChatFilterConditions`.
- **Cleanup `$project` stages**: If you add a `$lookup` + `$addFields` for a new field, don't remove it in the cleanup `$project` if a later `$project` still needs it.
- **Chat Dashboard doesn't support per-column filters** (only global search). Eval Dashboard does via `columnSearch` + `initComplete` filter inputs. Adding column filters to Chat Dashboard requires both frontend (`initComplete` + `columnSearch` in ajax) and backend (`columnSearch` handling in `chat-dashboard.js`).

## Key rules
- Department abbreviations (abbrKey) are defined in `agents/prompts/scenarios/departments_EN.js` / `departments_FR.js` — never invent new ones
- Pipeline is a LangGraph state machine in `agents/graphs/` — understand node flow before modifying
- `agents/prompts/systemPrompt.js` assembles the final prompt from `agenticBase.js` + `citationInstructions.js` + scenarios — read it to understand prompt composition
- Department scenario loading depends on the context node: `contextSystemPrompt.js` runs first (via ContextAgentService) to match the user's question to a department abbrKey, and ONLY then does `systemPrompt.js` use that matched abbrKey to dynamically import the corresponding `context-{abbrKey}/` scenario. No context match → no department scenario loaded.
