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

## Modifying the Pipeline

1. Understand the node flow: `init → validate → redact → translate → context → answer → verify → persist`
2. Graph definitions are in `agents/graphs/` — each file defines nodes, edges, and state annotations using LangChain's `StateGraph`
3. Shared node logic lives in `agents/graphs/workflows/GraphWorkflowHelper.js`
4. State is passed between nodes via annotations — check existing state fields before adding new ones
5. There are 4 graph variants (see [architecture doc](architecture-quick-ref.md#graph-variants-in-agentsgraphs)) — changes to shared logic should consider all variants
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
