# Common Task Patterns

Read this before starting any task matching the patterns below.

## Modifying Prompts

`agents/prompts/systemPrompt.js` assembles the prompt (`buildAnswerSystemPrompt()`) from
`agenticBase.js` (7-step response framework), `safety.js`, `citationInstructions.js`,
`scenarios/scenarios-all.js` (global rules) and the matched department scenario. Prompt
edits are maintainer-directed only — see AGENTS.md. After changing any shared prompt file
(not `scenarios/context-*/`):

```bash
node scripts/generate-system-prompt-documentation.js
```

## Adding or Modifying a Department Scenario

- `abbrKey` comes from `agents/prompts/scenarios/departments_EN.js` / `departments_FR.js` — never invent one.
- One folder per partner department: `agents/prompts/scenarios/context-{abbrKey}/{abbrKey}-scenarios.js` (lowercase, e.g. `context-cra-arc/cra-arc-scenarios.js`), exporting a string constant. `systemPrompt.js` dynamically imports it by `abbrKey`.
- Admin overrides layer on top via `ScenarioOverrideService` (`ScenarioOverride` model).
- No doc regeneration for scenario-file changes.

## Changing UI Text

Every string goes through `t()` with a key in both `src/locales/en.json` and `fr.json` —
rules in [official-languages.md](official-languages.md), key hygiene in AGENTS.md. The About
page and admin how-to guides are markdown, not locale keys — see below.

## Markdown-driven pages

A few pages take their text from markdown under `public/content/` instead of the
locale files, so content can be edited without touching components. Everything in
`public/` is copied into `build/` and served as static files — it is **not**
behind auth, so don't put anything there that shouldn't be public.

| Page | Files | Renders |
|---|---|---|
| About | `public/content/about-{en,fr}.md` | Named `##` sections, picked out by key in `AboutPage.js` |
| Admin how-to guides | `public/content/admin/*.md` | The whole document, via `HowToPage.js` |

Both use `useMarkdownWithFrontmatter(filename, contentDir)`, which fetches the
file, splits the YAML frontmatter, and also exposes `sections` keyed by `##`
heading.

### Frontmatter contract

```markdown
---
title: "Page title — AI Answers"
description: "One sentence, used for the meta description."
---

# Heading
```

`title` sets `document.title`; `description` sets the meta description. Both are
optional but expected on every page.

**Gotcha:** frontmatter is parsed by `src/utils/markdownFrontmatter.js` (shared by
the hook and `server/renderIndexHtml.js`, which patches `<title>`/meta on real page
loads) using `js-yaml` directly — *not* `gray-matter`. `package.json` `overrides`
pins `js-yaml` to 4.x, and gray-matter calls the `safeLoad` API that js-yaml 4
removed, so every gray-matter call throws. Don't use it. But don't remove it
either until `js-yaml` is a direct dependency: gray-matter is currently the only
thing pulling `js-yaml` into the production install, and without it the server
fails at module load — see
[#1774](https://github.com/cds-snc/ai-answers/issues/1774). A parse failure is
invisible on the About page (it only renders `##` sections, so a broken
frontmatter block silently disappears) but renders as raw text on a how-to page.

### Style guide

How-to guide and About page content must follow the
[Canada.ca content style guide](https://design.canada.ca/style-guide/index.html)
(plain language, sentence case, no em dashes: use a comma or simplify the
sentence instead, per the guide's "Hyphen and dashes" section). Check new or
revised text against it both while drafting and again as a final pass before
the change ships.

### Adding a how-to guide

1. Add the two markdown files to `public/content/admin/`, named in their own
   language (English name for EN, French name for FR).
2. Reference images as absolute paths — `/content/admin/images/foo-en.jpg`.
   Keep each language's screenshots on its own page only.
3. Add a route to `ROUTE_SLUGS` in `src/utils/routes.js` (French slug must be a
   real translation).
4. Add an entry to `HOW_TOS` in `src/config/howTos.js` with the matching route.
5. Add the `titleKey` to both `src/locales/en.json` and `fr.json`.

Routes, the admin-page link, and the AI Answers breadcrumb are all derived from
`HOW_TOS`, so steps 3–5 are all that's needed — no component changes.

### Rendering gotcha: GCDS resets list markers

The GCDS utility stylesheet applies `ol,ul{list-style:none}` globally and caps
`p{max-width:var(--gcds-text-character-limit)}`. Markdown-rendered lists
therefore need markers and the readable width asked for explicitly — see the
`ul`/`ol` overrides in `HowToPage.js` (`list-disc`/`list-decimal` + `text-measure`).

## Building an Admin Dashboard

Read [dashboards.md](dashboards.md) — data flow (`useDashboardMetrics` → `MetricsService` →
`api/metrics/*`), shared cards (`src/components/admin/dashboard/`), pure helpers
(`src/utils/dashboard/feedbackBreakdown.js`), `COLOURS` (`src/constants/dashboardColours.js`)
and the filter components. Figures are computed server-side by the `metrics-*` endpoints; the
frontend only fetches and formats. `PARTNER_DEPARTMENTS` (`src/constants/partnerDepartments.js`)
is the official partner list, shared with `FilterPanel`.

## Upgrading the AI Model

Model selection is decoupled from workflow: graphs define the pipeline, the
`model.default` setting picks the model **family**.

**Adding a model (deploy required):**
1. Add its config to `config/ai-models.js` under the provider.
2. Add a `case` for its `selectedAI` string in the relevant `AgentFactory.js` creators.
3. Add it to `AVAILABLE_MODELS` in `src/config/workflows.js` — that feeds the Settings, batch and chat dropdowns.
4. Add its label under `models.*` in both locale files.
5. Update `SYSTEM_CARD.md` / `SYSTEM_CARD_FR.md` and the model list in [architecture-quick-ref.md](architecture-quick-ref.md).

**Switching the default (no deploy):** Settings → General settings → Default model family. Takes effect for new chats immediately; rollback is the same switch. Roll out staging first, run batches and watch eval scores for 1–2 weeks, then production — each interaction records the model used, so quality is comparable on the eval dashboards.

**How it's wired:**
- `SettingsService` (`services/SettingsService.js`) is the single source of truth: it loads all settings on startup and seeds `SETTING_DEFAULTS` if missing. Add any new required setting there. Every consumer — public/authenticated settings APIs, `api/chat/chat-graph-run.js` (which injects the model into the graph input) — reads that cache. Never hardcode a model default in a UI component.
- Unauthenticated users get the default; authenticated admins can override via the chat Options dropdown.
- The family setting is routed per step by `AgentFactory.js`: translation and query-rewrite use a mini model, PII is pinned to `gpt-4o` so it stays in-region (Canada East), and context and answer use the full model. Evaluation/safety agents have their own model config there and are unaffected by the setting.

## Modifying the Pipeline

- Node flow: `init → validate → redact → translate → context → answer → verify → persist` (`similarQuestions` between context and answer on the QA graphs).
- Graphs live in `agents/graphs/` (LangChain `StateGraph`); shared node logic in `agents/graphs/workflows/GraphWorkflowHelper.js`; `registry.js` lazy-loads by name via `getGraphApp(name)`.
- State flows through annotations — check existing fields before adding one.
- Five graph variants (the four in the table plus `DefaultWithLocalModel.js`) share the helper (see [architecture-quick-ref.md](architecture-quick-ref.md#graph-variants-in-agentsgraphs)) — a change to shared logic must hold for all of them.

## Adding an API Route

Handler file in `api/{domain}/` exporting `async function handler(req, res)` (Express
conventions: check method, parse body, call a service, return JSON); register it in
`server/server.js`. Chat endpoints stream over SSE — `api/chat/chat-graph-run.js` is the pattern.

## Working with Models and DB

- Mongoose schemas in `models/`. Key chain: `Chat` → `Interaction` → `Question`, `Answer`, `Context`, `Eval`, `ExpertFeedback`, `PublicFeedback`; `Answer` → `Citation`, `Tool`.
- Tests use MongoDB Memory Server — `test/setup.js`.
- Vector ops: `IMVectorService` (in-memory) or `DocDBVectorService` (Azure CosmosDB) via `VectorServiceFactory`.

## Working with Services

Two patterns — an object of async methods (most common) or a class. Key ones:
`AnswerGenerationService` (LLM call with system prompt), `SearchContextService`
(canada.ca/Google search), `InteractionPersistenceService` (saves an interaction and its
linked docs), `QuestionAnswerService` (similar past Q&A), `PIIAgentService`,
`ScenarioOverrideService`.
