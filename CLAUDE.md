# Claude Code Instructions

## How to work well in this codebase

1. **State assumptions early.** Before implementing anything non-trivial, say what you're assuming so we can catch misalignment before code is written.
2. **Pause on ambiguity.** If you hit inconsistencies, conflicting requirements, or unclear specs, surface the tradeoff or ask for clarification rather than guessing.
3. **Push back when it helps.** If the human's approach has clear problems, point it out directly and propose an alternative. Agreeing to avoid friction wastes everyone's time.
4. **Keep it simple.** Favour the boring, obvious solution. If 100 lines would do and you wrote 1000, something went wrong.
5. **Stay scoped.** Avoid removing comments you don't understand, "cleaning up" code orthogonal to the task, refactoring adjacent systems as side effects, or deleting code that seems unused without asking first.
6. **Flag dead code.** After refactoring or implementing changes, point out code that's now unreachable and ask what to do with it.
7. **Clarify success criteria.** If instructions don't include them, reframe the goal explicitly so you can loop, retry, and problem-solve rather than following steps that may not lead anywhere.
8. **Test-first for non-trivial logic.** Write the test that defines success, implement until it passes, then show both.

## Documentation Regeneration

When any file in `agents/prompts/` is changed (except department scenarios in `agents/prompts/scenarios/context-*/`), regenerate the system prompt documentation:

```bash
node scripts/generate-system-prompt-documentation.js
```

This keeps `docs/agents-prompts/system-prompt-documentation.md` in sync with the actual prompts.

## Official languages
**Never hardcode user-facing text in components or pages.** All UI strings must use translation keys via `t()` and have entries in both `src/locales/en.json` and `src/locales/fr.json`. When adding any new UI text (column headers, labels, buttons, messages, placeholders, etc.), always add the corresponding key to both locale files in the same PR — don't rely on the fallback string in `t('key', 'fallback')`.

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
