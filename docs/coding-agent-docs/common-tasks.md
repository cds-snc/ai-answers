# Common Task Patterns

Read this before starting any task matching the patterns below.

## Modifying Prompts

**Key files:**
- `agents/prompts/systemPrompt.js` — assembles the final prompt via `buildAnswerSystemPrompt()`
- `agents/prompts/agenticBase.js` — core 7-step response framework (~188 lines)
- `agents/prompts/citationInstructions.js` — citation selection and verification rules
- `agents/prompts/scenarios/scenarios-all.js` — global rules for all departments

**After changing any file in `agents/prompts/`** (except `scenarios/context-*/`):

```bash
node scripts/generate-system-prompt-documentation.js
```

This regenerates `docs/agents-prompts/system-prompt-documentation.md`.

**Do NOT run regeneration** when only editing department scenario files in `agents/prompts/scenarios/context-*/`.

## Adding or Modifying a Department Scenario

1. Find the department's `abbrKey` in `agents/prompts/scenarios/departments_EN.js` (or `departments_FR.js`). Never invent new abbreviations.
2. Scenario folder naming: `agents/prompts/scenarios/context-{abbrKey}/` (lowercase, e.g. `context-cra-arc/`)
3. Each folder contains one JS file: `{abbrKey}-scenarios.js` exporting a string constant
4. `systemPrompt.js` dynamically imports the scenario based on the department parameter
5. There are currently 16 department-specific scenario folders
6. Admin scenario overrides are also possible via `ScenarioOverrideService` (stored in the `ScenarioOverride` model)

## Changing UI Text

**Always update both languages:**
- `src/locales/en.json` — English UI messages
- `src/locales/fr.json` — French UI messages

**About page** uses separate markdown files (not locales):
- `public/content/about-en.md`
- `public/content/about-fr.md`

See [Markdown-driven pages](#markdown-driven-pages) below for how these render.

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

**Gotcha:** the hook parses YAML with `js-yaml` directly, *not* `gray-matter`.
`package.json` `overrides` pins `js-yaml` to 4.x for every dependency, and
gray-matter calls the `safeLoad` API that js-yaml 4 removed — under that pin
every gray-matter call throws. Don't reintroduce it. Note that a parse failure
is invisible on the About page (it only renders `##` sections, so a broken
frontmatter block silently disappears) but renders as raw text on a how-to page.

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

Reuse the shared dashboard building blocks — don't recompute metrics or redefine cards/colours per page. All figures are computed server-side by the `metrics-*` endpoints; the frontend only fetches and formats.

- **Data:** `useDashboardMetrics()` (`src/hooks/admin/useDashboardMetrics.js`) — fetches the metric bundle (usage/sessions/expert/public-feedback/departments) with abort + loading/error. Call `fetchMetrics({ startDate, endDate, department? })`; omit `department` for all partners.
- **Derivations:** `src/utils/dashboard/feedbackBreakdown.js` — pure `buildQualityData(expertScored, t)`, `buildSatisfactionData(publicFeedbackTotals, t)`, `buildYesReasonsData(publicFeedbackReasons, lang)`, `groupByScore`.
- **Filter UI:** `<DashboardFilterBar lang loading onApply={fetchMetrics} />` (`src/components/admin/DashboardFilterBar.js`) — partner dropdown + date range, defaults to last 30 days / all partners.
- **Cards:** `StatCard` / `DonutCard` / `HBarCard` in `src/components/admin/dashboard/`.
- **Colours:** import `{ COLOURS, QUALITY_COLOURS }` from `src/constants/dashboardColours.js` — never hardcode chart hexes (greys/borders may stay local).
- **Partner list:** `PARTNER_DEPARTMENTS` from `src/constants/partnerDepartments.js` (the official 22, shared with `FilterPanel`).

`PublicDashboard.js` / `PartnerDashboard.js` are reference consumers. `MetricsDashboard.js` predates these helpers and does its own thing.

## Upgrading the AI Model

Model selection is decoupled from workflow logic. Workflows (GenericGraph, DefaultWithVectorGraph, InstantAndQAGraph) define the pipeline structure. The model (which LLM to call) is set independently via Settings.

### Adding a new model (code change — deploy required)

1. Add the model config to `config/ai-models.js` under the appropriate provider (azure/openai)
2. Add a `case` for the new model's `selectedAI` string in the relevant `AgentFactory.js` agent creation functions
3. Add the model to `AVAILABLE_MODELS` in `src/config/workflows.js` — this automatically makes it available in the Settings, batch, and chat dropdowns
4. Add locale keys for the model label in both `src/locales/en.json` and `src/locales/fr.json` (under `models.*`)
5. Update documentation:
   - `SYSTEM_CARD.md` and `SYSTEM_CARD_FR.md` — production model references
   - `docs/coding-agent-docs/architecture-quick-ref.md` — model list in AI Model Config section

### Switching the default model (Settings change — no deploy)

1. Go to **Settings > General settings > Default model family**
2. Select the new model from the dropdown
3. The change takes effect immediately for all new chat requests

### Recommended rollout process

1. **Staging first**: In the staging/sandbox environment Settings, change "Default model family" to the new model
2. **Test for 1-2 weeks**: Run batches, monitor eval scores, check logs for errors
3. **Flip production**: In the production Settings, change "Default model family" to the new model
4. **Monitor**: Watch eval dashboards — each interaction records the model used, so you can compare quality
5. **Rollback if needed**: Change "Default model family" back to the previous model in Settings — instant, no deploy

### Architecture notes

- **`SettingsService` is the single source of truth for the default model.** It loads all settings from the database on server startup (`loadAll()`), and seeds required defaults (like `model.default`) if they are missing. Every consumer — the public settings API, the authenticated settings API, and `chat-graph-run.js` — reads from this cache. The frontend (Chat, Batch, Settings pages) fetches from these APIs. Never hardcode model defaults in UI components; always read from Settings.
- **When adding a new required setting**, add it to `SETTING_DEFAULTS` in `services/SettingsService.js`. This ensures it exists in the database from the first server startup, before any admin visits the Settings page.
- The server resolves the model in `api/chat/chat-graph-run.js` and injects it into the graph input
- Unauthenticated users always get the Settings default model
- Authenticated admins can override via the chat Options dropdown (for testing)
- **The setting selects a model family, not a single model.** `AgentFactory.js` automatically routes each pipeline step to the right model within that family — supporting steps (PII redaction, translation, query rewrite) use the mini variant (e.g. GPT-5-mini), while context and answer generation use the full model (e.g. GPT-5.1). Admins do not configure this; it is handled internally.
- The evaluation pipeline uses its own model (`gpt-4.1-mini`) configured separately in `AgentFactory.js` — it is not affected by the default model family setting
## Modifying the Pipeline

1. Understand the node flow: `init → validate → redact → translate → context → answer → verify → persist`
2. Graph definitions are in `agents/graphs/` — each file defines nodes, edges, and state annotations using LangChain's `StateGraph`
3. Shared node logic lives in `agents/graphs/workflows/GraphWorkflowHelper.js`
4. State is passed between nodes via annotations — check existing state fields before adding new ones
5. There are 3 graph variants (see [architecture doc](architecture-quick-ref.md#graph-variants-in-agentsgraphs)) — changes to shared logic should consider all variants
6. The graph registry (`agents/graphs/registry.js`) lazy-loads graphs by name via `getGraphApp(name)`

## Adding an API Route

1. Create a handler file in the appropriate `api/{domain}/` subdirectory
2. Export `async function handler(req, res)` — follows Express conventions
3. Check method (GET/POST), parse body, call service, return JSON
4. Register the route in `server/server.js`
5. Chat endpoints use Server-Sent Events (SSE) for streaming — see `api/chat/chat-graph-run.js` for the pattern

## Working with Models and DB

- Mongoose schemas are in `models/` (19 models)
- Key chain: `Chat` → `Interaction` → `Question`, `Answer`, `Context`, `Eval`, `ExpertFeedback`, `PublicFeedback`
- `Answer` → `Citation`, `Tool`
- Tests use MongoDB Memory Server (in-memory) — see `test/setup.js`
- Vector operations use either `IMVectorService` (in-memory) or `DocDBVectorService` (Azure CosmosDB), selected via `VectorServiceFactory`

## Working with Services

Services follow two patterns:
```js
// Object with methods (most common)
export const ServiceName = { async methodName(params) { ... } }

// Class-based
export class ServiceName { async methodName(params) { ... } }
```

Key services to know:
- `AnswerGenerationService` — invokes LLM with system prompt
- `SearchContextService` — runs search against canada.ca/Google
- `InteractionPersistenceService` — saves interaction + all linked docs
- `QuestionAnswerService` — finds similar Q&A pairs from history
- `PIIAgentService` — detects PII in user messages
- `ScenarioOverrideService` — fetches/applies custom scenario text per department


